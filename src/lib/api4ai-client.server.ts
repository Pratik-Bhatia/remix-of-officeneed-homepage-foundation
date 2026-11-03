// Thin, directly-mockable wrapper around API4AI's Image Background Removal
// HTTP API -- the API4AI counterpart of remove-bg-client.server.ts, kept as
// its own module so tests can `mock.module` this exact import path.
//
// Contract (API4AI's official examples repo + the service's own OpenAPI
// spec, https://api4ai.cloud/img-bg-removal/v1/openapi.json, v1.34.0):
// - POST https://api4ai.cloud/img-bg-removal/v1/results?mode=fg-image&kind=general
// - Header `X-API-KEY: <key>` (API4AI Developer Portal key)
// - multipart/form-data, file field `image`
// - 200 + JSON `{ results: [{ status: { code, message }, width, height,
//   entities: [{ kind: "image", image: <base64>, format: "PNG" }, ...] }] }`
// - A 200 can still carry `status.code` "failure"; only "ok" is a success.
//
// Unlike remove.bg this returns JSON (not raw image bytes) and exposes no
// credit/cost headers, so creditsCharged is always null here.
import type { BackgroundRemovalApiResult } from "@/lib/background-removal-types";

export const API4AI_ENDPOINT = "https://api4ai.cloud/img-bg-removal/v1/results";
export const API4AI_MODE = "fg-image" as const;
export const API4AI_KIND = "general" as const;

/** Hard cap on the JSON body we are willing to buffer. The input is capped
 * at 5MB / 4096px by image-validation.server.ts, so a legitimate base64 PNG
 * result is far below this; anything larger is treated as a bad response
 * rather than risking Worker memory. */
export const API4AI_MAX_RESPONSE_BYTES = 40 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function failure(status: number, errorText: string, width: string | null = null, height: string | null = null): BackgroundRemovalApiResult {
  return { ok: false, status, errorText, creditsCharged: null, responseType: null, responseWidth: width, responseHeight: height };
}

function decodeBase64(b64: string): Uint8Array | null {
  try {
    const binary = atob(b64.replace(/^data:image\/\w+;base64,/, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function callApi4aiApi(params: {
  apiKey: string;
  imageBytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  timeoutMs?: number;
}): Promise<BackgroundRemovalApiResult> {
  // Never log params.apiKey or the X-API-KEY header, and never put either
  // into the returned result.
  const timeoutMs = params.timeoutMs ?? 30_000;
  const url = `${API4AI_ENDPOINT}?mode=${API4AI_MODE}&kind=${API4AI_KIND}`;
  const extension = params.mimeType === "image/jpeg" ? "jpg" : params.mimeType.slice("image/".length);

  const form = new FormData();
  // Copy into a fresh ArrayBuffer-backed view so the Blob never captures a
  // larger shared buffer.
  form.append("image", new Blob([params.imageBytes.slice()], { type: params.mimeType }), `logo.${extension}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "X-API-KEY": params.apiKey, Accept: "application/json" },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return failure(isTimeout ? 408 : 500, isTimeout ? `Request timed out after ${timeoutMs}ms` : (err?.message || String(err)));
  }

  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (declaredLength > API4AI_MAX_RESPONSE_BYTES) {
    return failure(502, `API4AI response too large (${declaredLength} bytes)`);
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (err: any) {
    return failure(502, `Could not read API4AI response: ${err?.message || String(err)}`);
  }
  if (bodyText.length > API4AI_MAX_RESPONSE_BYTES) {
    return failure(502, `API4AI response too large (${bodyText.length} bytes)`);
  }

  if (!response.ok) {
    return failure(response.status, bodyText.slice(0, 500));
  }

  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return failure(502, "API4AI returned a non-JSON response");
  }

  const result = Array.isArray(parsed?.results) ? parsed.results[0] : undefined;
  if (!result || typeof result !== "object") {
    return failure(502, "API4AI response has no results");
  }
  const width = Number.isFinite(result.width) ? String(result.width) : null;
  const height = Number.isFinite(result.height) ? String(result.height) : null;

  const code = result.status?.code;
  if (code !== "ok") {
    const message = typeof result.status?.message === "string" ? result.status.message : "";
    return failure(502, `API4AI status ${String(code ?? "missing")}${message ? `: ${message}` : ""}`.slice(0, 500), width, height);
  }

  const entity = Array.isArray(result.entities) ? result.entities[0] : undefined;
  if (!entity || typeof entity.image !== "string" || entity.image.length === 0) {
    return failure(502, "API4AI response has no image entity", width, height);
  }
  if (entity.format && String(entity.format).toUpperCase() !== "PNG") {
    return failure(502, `API4AI returned unexpected image format ${String(entity.format)}`, width, height);
  }

  const bytes = decodeBase64(entity.image);
  if (!bytes || bytes.length < PNG_SIGNATURE.length || !PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return failure(502, "API4AI image is not a valid PNG", width, height);
  }

  return {
    ok: true,
    status: response.status,
    arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    creditsCharged: null,
    // API4AI reports no response type; recording the provider here keeps
    // the existing response_type audit column meaningful without a schema
    // change (remove.bg rows keep its own "preview"/"other" X-Type values).
    responseType: "api4ai",
    responseWidth: width,
    responseHeight: height,
  };
}
