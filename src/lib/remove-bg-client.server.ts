// Thin, directly-mockable wrapper around remove.bg's HTTP API. Kept as its
// own module rather than inlined in image-processing.functions.ts so tests
// can `mock.module` this exact import path -- the same convention
// b2b-company-setup.functions.test.mjs already uses for shopify-admin.server
// (register the mock once at module scope, swap behavior per-test via a
// mutable implementation variable, dynamic-import the module under test
// after the mock is registered).
export interface RemoveBgApiResult {
  ok: boolean;
  status: number;
  arrayBuffer?: ArrayBuffer;
  errorText?: string;
  creditsCharged: string | null;
  responseType: string | null;
  responseWidth: string | null;
  responseHeight: string | null;
}

export async function callRemoveBgApi(params: {
  apiKey: string;
  imageBase64: string;
  size: "small" | "auto";
  timeoutMs?: number;
}): Promise<RemoveBgApiResult> {
  // Never log params.apiKey or the Authorization/X-Api-Key header here or
  // anywhere that reads this function's return value -- the key itself is
  // deliberately excluded from RemoveBgApiResult.
  const timeoutMs = params.timeoutMs ?? 30_000;
  let response: Response;
  try {
    response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": params.apiKey,
        "Content-Type": "application/json",
        "Accept": "image/png",
      },
      body: JSON.stringify({
        image_file_b64: params.imageBase64,
        size: params.size,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      ok: false,
      status: isTimeout ? 408 : 500,
      errorText: isTimeout ? `Request timed out after ${timeoutMs}ms` : (err?.message || String(err)),
      creditsCharged: null,
      responseType: null,
      responseWidth: null,
      responseHeight: null,
    };
  }

  // remove.bg echoes exactly what it charged THIS request on the response
  // itself -- surfacing these is what makes credit consumption auditable
  // from our own logs instead of only a delayed aggregate on their
  // dashboard. X-Type is "preview" or "other" (their own label for a
  // non-preview/full-resolution result); X-Credits-Charged is the actual
  // fractional-or-whole credit amount debited for this one call.
  const creditsCharged = response.headers.get("X-Credits-Charged");
  const responseType = response.headers.get("X-Type");
  const responseWidth = response.headers.get("X-Width");
  const responseHeight = response.headers.get("X-Height");

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, status: response.status, errorText, creditsCharged, responseType, responseWidth, responseHeight };
  }

  const arrayBuffer = await response.arrayBuffer();
  return { ok: true, status: response.status, arrayBuffer, creditsCharged, responseType, responseWidth, responseHeight };
}
