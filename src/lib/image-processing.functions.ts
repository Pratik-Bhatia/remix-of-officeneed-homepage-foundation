import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { decode, encode } from "fast-png";
import { validateUploadedImage } from "@/lib/image-validation.server";
import { callRemoveBgApi } from "@/lib/remove-bg-client.server";
import {
  hashIdentityKey,
  computeFingerprint,
  tryReserveConcurrentSlot,
  releaseConcurrentSlot,
  claimProcessingSlot,
  finalizeSuccess,
  finalizeFailure,
  recordUsage,
  getUserConcurrentLimit,
} from "@/lib/logo-processing-safeguards.server";

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

// Fast, always-available first line of defense -- in-memory, per-isolate
// only (see logo-processing-safeguards.server.ts for why that's an
// accepted limitation on this app's Cloudflare Workers deployment), but
// cheap enough to run before any of the heavier checks below. The
// Supabase-backed daily/global caps and fingerprint dedup are the
// authoritative, cross-instance safeguards; this is just a fast local
// backstop against a tight burst from one IP.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + RATE_LIMIT_WINDOW;
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  record.count += 1;
  return true;
}

const REMOVE_BG_SIZE = "small" as const;

export type ProcessLogoResult =
  | { success: true; uvLogoUrl: string; laserLogoUrl: string }
  | { success: false; error: string };

// The actual orchestration, extracted as a plain async function so it's
// testable directly: processLogoServer's handler below, like every
// createServerFn handler in this codebase (see enquiries.functions.ts's
// own test file for the same pattern), can't run under node:test because
// it depends on a live TanStack Start request context. Taking `ip` as a
// parameter instead of calling getRequestIP() internally is what makes
// this piece request-context-free.
export async function processLogoCore(data: { imageBase64: string }, ip: string): Promise<ProcessLogoResult> {
    const identityKey = hashIdentityKey(ip);
    let fingerprint: string | null = null;
    let slotId: string | null = null;
    let claimToken: string | null = null;

    try {
      if (!checkRateLimit(ip)) {
        await recordUsage({ identityKey, fingerprint: null, outcome: "rate_limited", wasOutboundCall: false, errorMessage: "per-IP burst limit" });
        return { success: false, error: "Too many requests. Please try again later." };
      }

      const apiKey = process.env["REMOVE_BG_API_KEY"];
      if (!apiKey) {
        // Fail safe: never proceed (and never claim a cache slot) without
        // a key to actually call remove.bg with.
        return { success: false, error: "Image processing is not configured." };
      }

      const base64Data = data.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      let binaryString: string;
      try {
        binaryString = atob(base64Data);
      } catch {
        await recordUsage({ identityKey, fingerprint: null, outcome: "validation_rejected", wasOutboundCall: false, errorMessage: "invalid base64 encoding" });
        return { success: false, error: "Invalid image encoding." };
      }

      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Server-side validation only -- never trusts the browser's MIME
      // type, filename extension, or any client-reported width/height.
      // Nothing past this point runs for a file that fails here, so an
      // invalid upload never reaches remove.bg (and never costs a credit
      // or a free-preview slot).
      const validation = validateUploadedImage(bytes);
      if (!validation.valid) {
        await recordUsage({ identityKey, fingerprint: null, outcome: "validation_rejected", wasOutboundCall: false, errorMessage: validation.error });
        return { success: false, error: validation.error };
      }

      // Fingerprint of the ACTUAL validated bytes (+ the size parameter
      // that will be sent), computed here server-side -- never anything
      // the client asserts. Drives both the cross-instance cache lookup
      // below and the concurrency-slot key.
      fingerprint = computeFingerprint(validation.image.bytes, REMOVE_BG_SIZE);

      const reservation = await tryReserveConcurrentSlot(identityKey);
      if (reservation.kind === "over_limit") {
        await recordUsage({ identityKey, fingerprint, outcome: "rate_limited", wasOutboundCall: false, errorMessage: `over concurrent limit (${getUserConcurrentLimit()})` });
        return { success: false, error: "You already have a logo being processed. Please wait for it to finish." };
      }
      if (reservation.kind === "unavailable") {
        // Fail closed: the concurrency cap is Supabase-backed now (not an
        // in-memory counter alone -- see logo-processing-safeguards.server.ts),
        // so if we can't reach it we can't safely enforce it. Refusing the
        // request here is the whole point of requirement 2 -- never let a
        // remove.bg call through uncounted just because our own
        // infrastructure had a hiccup.
        await recordUsage({ identityKey, fingerprint, outcome: "unavailable", wasOutboundCall: false, errorMessage: "concurrency store unavailable" });
        return { success: false, error: "Logo processing is temporarily unavailable. Please try again in a few minutes." };
      }
      slotId = reservation.slotId;

      const claim = await claimProcessingSlot(fingerprint, identityKey);

      if (claim.kind === "unavailable") {
        await recordUsage({ identityKey, fingerprint, outcome: "unavailable", wasOutboundCall: false, errorMessage: "dedup/quota store unavailable" });
        return { success: false, error: "Logo processing is temporarily unavailable. Please try again in a few minutes." };
      }

      if (claim.kind === "over_daily_limit") {
        await recordUsage({ identityKey, fingerprint, outcome: "rate_limited", wasOutboundCall: false, errorMessage: `over ${claim.scope} daily limit` });
        return {
          success: false,
          error: claim.scope === "user"
            ? "You've reached today's logo-processing limit. Please try again tomorrow, or contact us for help."
            : "Logo processing is temporarily at capacity. Please try again shortly.",
        };
      }

      if (claim.kind === "cache_hit") {
        await recordUsage({ identityKey, fingerprint, outcome: "cache_hit", wasOutboundCall: false });
        return { success: true, uvLogoUrl: claim.row.uv_logo_url!, laserLogoUrl: claim.row.laser_logo_url! };
      }

      if (claim.kind === "failed_upstream") {
        await recordUsage({ identityKey, fingerprint, outcome: "api_call_failed", wasOutboundCall: false, errorMessage: claim.row.error_message ?? "upstream failure" });
        return { success: false, error: "We couldn't process this logo. Please try again or upload a different image." };
      }

      if (claim.kind === "timed_out_waiting") {
        // An identical upload is apparently still being processed
        // elsewhere and didn't resolve within our wait window. We do NOT
        // fall through and call remove.bg ourselves here -- that request
        // may still complete successfully, and firing a second one now
        // would be exactly the duplicate-billing risk this module exists
        // to prevent. The honest answer is "we don't know the outcome
        // yet," so we ask the shopper to retry rather than guess.
        await recordUsage({ identityKey, fingerprint, outcome: "rate_limited", wasOutboundCall: false, errorMessage: "timed out waiting for in-flight duplicate" });
        return { success: false, error: "Still processing a matching upload. Please try again in a few seconds." };
      }

      // claim.kind === "claimed" -- we're the one request that actually
      // holds the lease and calls remove.bg for this fingerprint.
      claimToken = claim.ownerToken;
      const startedAt = Date.now();
      const apiResult = await callRemoveBgApi({ apiKey, imageBase64: base64Data, size: REMOVE_BG_SIZE });
      const durationMs = Date.now() - startedAt;

      if (!apiResult.ok) {
        const errorMessage = `Remove.bg API failed: ${apiResult.status} ${apiResult.errorText ?? ""}`.trim();
        await finalizeFailure(fingerprint, claimToken, errorMessage);
        await recordUsage({
          identityKey, fingerprint, outcome: "api_call_failed", wasOutboundCall: true,
          creditsCharged: apiResult.creditsCharged, responseType: apiResult.responseType,
          responseWidth: apiResult.responseWidth, responseHeight: apiResult.responseHeight,
          durationMs, errorMessage,
        });
        return { success: false, error: errorMessage };
      }

      const uvArrayBuffer = apiResult.arrayBuffer!;
      const uvBase64 = `data:image/png;base64,${arrayBufferToBase64(uvArrayBuffer)}`;

      const pngImage = decode(uvArrayBuffer);
      const pixels = pngImage.data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3]! > 0) {
          const r = pixels[i]!;
          const g = pixels[i + 1]!;
          const b = pixels[i + 2]!;
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          const silverBase = Math.floor(160 + (luminance / 255) * 60);
          pixels[i] = silverBase;
          pixels[i + 1] = silverBase;
          pixels[i + 2] = silverBase;
        }
      }
      const laserUint8 = encode(pngImage);
      const laserBase64 = `data:image/png;base64,${arrayBufferToBase64(laserUint8)}`;

      await finalizeSuccess(fingerprint, claimToken, {
        uvLogoUrl: uvBase64, laserLogoUrl: laserBase64,
        creditsCharged: apiResult.creditsCharged, responseType: apiResult.responseType,
        responseWidth: apiResult.responseWidth, responseHeight: apiResult.responseHeight,
      });
      await recordUsage({
        identityKey, fingerprint, outcome: "api_call_succeeded", wasOutboundCall: true,
        creditsCharged: apiResult.creditsCharged, responseType: apiResult.responseType,
        responseWidth: apiResult.responseWidth, responseHeight: apiResult.responseHeight,
        durationMs,
      });

      return { success: true, uvLogoUrl: uvBase64, laserLogoUrl: laserBase64 };
    } catch (e: any) {
      if (fingerprint && claimToken) {
        await finalizeFailure(fingerprint, claimToken, e?.message || String(e));
      }
      return { success: false, error: "Server error: " + (e.message || String(e)) };
    } finally {
      if (slotId) await releaseConcurrentSlot(slotId);
    }
}

export const processLogoServer = createServerFn({ method: "POST" })
  .validator((data: { imageBase64: string }) => {
    if (!data || typeof data.imageBase64 !== "string") {
      throw new Error("Invalid request: image data is required.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const ip = getRequestIP() || getRequestHeader("x-forwarded-for") || "unknown";
    return processLogoCore(data, ip);
  });
