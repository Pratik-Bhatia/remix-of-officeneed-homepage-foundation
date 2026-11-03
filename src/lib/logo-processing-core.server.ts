// Server-only logo-processing orchestration (background-removal provider
// call with at most one fallback, validation, per-IP/concurrency/daily-cap
// safeguards, hashing, output normalisation). Lives in a `.server`
// module on purpose: image-processing.functions.ts is imported by browser
// code (ProductCustomizer), so anything it keeps at module level -- including
// an exported plain function like this one -- is part of the client graph.
// Keeping the orchestration here, and loading it only inside the server
// function's handler, is what keeps node:crypto, the safeguards and the
// provider API keys out of the browser.
import { validateUploadedImage, type ValidatedImage } from "@/lib/image-validation.server";
import { resolveProviderPlan, type ConfiguredProvider } from "@/lib/background-removal-providers.server";
import { buildLogoOutputs, buildLogoOutputsFromRgba } from "@/lib/png-output.server";
import { analyzeForLocalRemoval, LOCAL_CACHE_VARIANT, type LocalAnalysis } from "@/lib/local-background-removal.server";
import type { BackgroundRemovalApiResult } from "@/lib/background-removal-types";
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
  getLeaseDurationSeconds,
  extendClaimLease,
  lookupCachedResult,
  cacheResultIfAbsent,
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

/** Per-provider-call timeout. With one fallback the worst case is two of
 * these back to back; the cache lease is extended before the fallback. */
const PROVIDER_TIMEOUT_MS = 30_000;

/** Shown to the shopper for any provider/output failure. The detailed
 * reason (which may include upstream response text) is kept server-side in
 * the cache row, the usage row and the log -- never sent to the browser. */
export const PROCESSING_FAILED_ERROR = "We couldn't process this logo. Please try again or upload a different image.";

type ProviderAttempt =
  | { ok: true; uvLogoUrl: string; laserLogoUrl: string; api: BackgroundRemovalApiResult; durationMs: number }
  | { ok: false; errorMessage: string; api: BackgroundRemovalApiResult | null; reachedProvider: boolean; durationMs: number };

/** Exactly one outbound call to one provider, plus output validation and
 * UV/laser generation. Never retries. A throw is converted into a failed
 * attempt so the caller can decide on the (single) fallback. */
async function attemptProvider(configured: ConfiguredProvider, image: ValidatedImage, imageBase64: string): Promise<ProviderAttempt> {
  const { provider, apiKey } = configured;
  const startedAt = Date.now();
  let api: BackgroundRemovalApiResult;
  try {
    api = await provider.call({ apiKey, image, imageBase64, timeoutMs: PROVIDER_TIMEOUT_MS });
  } catch (e: any) {
    return { ok: false, errorMessage: `${provider.displayName} call threw: ${e?.message || String(e)}`, api: null, reachedProvider: true, durationMs: Date.now() - startedAt };
  }
  const durationMs = Date.now() - startedAt;
  if (!api.ok || !api.arrayBuffer) {
    return { ok: false, errorMessage: `${provider.displayName} API failed: ${api.status} ${api.errorText ?? ""}`.trim(), api, reachedProvider: true, durationMs };
  }
  const outputs = buildLogoOutputs(new Uint8Array(api.arrayBuffer));
  if (!outputs.ok) {
    return { ok: false, errorMessage: `${provider.displayName} output rejected: ${outputs.error}`, api, reachedProvider: true, durationMs };
  }
  return {
    ok: true,
    uvLogoUrl: `data:image/png;base64,${arrayBufferToBase64(outputs.images.uvPng)}`,
    laserLogoUrl: `data:image/png;base64,${arrayBufferToBase64(outputs.images.laserPng)}`,
    api,
    durationMs,
  };
}

function apiAuditFields(api: BackgroundRemovalApiResult | null) {
  return {
    creditsCharged: api?.creditsCharged ?? null,
    responseType: api?.responseType ?? null,
    responseWidth: api?.responseWidth ?? null,
    responseHeight: api?.responseHeight ?? null,
  };
}

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

      const plan = resolveProviderPlan();
      if (!plan) {
        // Fail safe: never proceed (and never claim a cache slot) without
        // a key to actually call a provider with. Keys come only from the
        // server-side API4AI_API_KEY / REMOVE_BG_API_KEY variables (never a
        // VITE_ copy); resolveProviderPlan logs which one is missing.
        return { success: false, error: "Image processing is not configured." };
      }
      const primary = plan.primary;

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
      // invalid upload never reaches a provider (and never costs a credit
      // or a free-preview slot).
      const validation = validateUploadedImage(bytes);
      if (!validation.valid) {
        await recordUsage({ identityKey, fingerprint: null, outcome: "validation_rejected", wasOutboundCall: false, errorMessage: validation.error });
        return { success: false, error: validation.error };
      }

      // Fingerprint of the ACTUAL validated bytes (+ the primary provider's
      // cache variant), computed here server-side -- never anything the
      // client asserts. Provider-specific: remove.bg keeps its original
      // variant (existing cached results still match); API4AI has its own,
      // so it is never served a remove.bg result.
      const image = validation.image;
      fingerprint = computeFingerprint(image.bytes, primary.provider.cacheVariant);

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
        // provider call through uncounted just because our own
        // infrastructure had a hiccup.
        await recordUsage({ identityKey, fingerprint, outcome: "unavailable", wasOutboundCall: false, errorMessage: "concurrency store unavailable" });
        return { success: false, error: "Logo processing is temporarily unavailable. Please try again in a few minutes." };
      }
      slotId = reservation.slotId;

      // Plain-background / already-transparent logos are processed locally
      // (no paid call, sub-second). Runs only AFTER the concurrency slot is
      // held, so its CPU work is bounded by the same per-identity cap. The
      // local path still goes through the SAME claim -> daily-quota -> cache
      // flow below; it only changes the cache variant and the processor.
      const localStartedAt = Date.now();
      let local: LocalAnalysis;
      try {
        local = analyzeForLocalRemoval(image);
      } catch (e: any) {
        local = { kind: "unsuitable", reason: `local analysis threw: ${e?.message || String(e)}` };
      }
      const localAnalysisMs = Date.now() - localStartedAt;
      if (local.kind !== "unsuitable") {
        fingerprint = computeFingerprint(image.bytes, LOCAL_CACHE_VARIANT);
      } else {
        console.log(`[logo-processing] local removal not used (${local.reason}); using ${primary.provider.displayName}.`);
      }
      const source = local.kind !== "unsuitable" ? ("local" as const) : primary.provider.id;

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
        await recordUsage({ identityKey, fingerprint, provider: source, outcome: "cache_hit", wasOutboundCall: false });
        return { success: true, uvLogoUrl: claim.row.uv_logo_url!, laserLogoUrl: claim.row.laser_logo_url! };
      }

      if (claim.kind === "failed_upstream") {
        await recordUsage({ identityKey, fingerprint, outcome: "api_call_failed", wasOutboundCall: false, errorMessage: claim.row.error_message ?? "upstream failure" });
        return { success: false, error: "We couldn't process this logo. Please try again or upload a different image." };
      }

      if (claim.kind === "timed_out_waiting") {
        // An identical upload is apparently still being processed
        // elsewhere and didn't resolve within our wait window. We do NOT
        // fall through and call the provider ourselves here -- that request
        // may still complete successfully, and firing a second one now
        // would be exactly the duplicate-billing risk this module exists
        // to prevent. The honest answer is "we don't know the outcome
        // yet," so we ask the shopper to retry rather than guess.
        await recordUsage({ identityKey, fingerprint, outcome: "rate_limited", wasOutboundCall: false, errorMessage: "timed out waiting for in-flight duplicate" });
        return { success: false, error: "Still processing a matching upload. Please try again in a few seconds." };
      }

      // claim.kind === "claimed" -- we're the one request that actually
      // holds the lease and calls the provider for this fingerprint.
      claimToken = claim.ownerToken;

      if (local.kind !== "unsuitable") {
        // Local result: same finalize/usage bookkeeping as a provider call.
        // The usage table outcome values are fixed by its CHECK constraint,
        // so a local success is recorded as api_call_succeeded with
        // was_outbound_call=false and response_type="local".
        const outputStartedAt = Date.now();
        const outputs = buildLogoOutputsFromRgba(local.rgba);
        const durationMs = localAnalysisMs + (Date.now() - outputStartedAt);
        const audit = {
          creditsCharged: null, responseType: "local",
          responseWidth: String(local.rgba.width), responseHeight: String(local.rgba.height),
        };
        if (!outputs.ok) {
          const errorMessage = `local output rejected: ${outputs.error}`;
          await finalizeFailure(fingerprint, claimToken, errorMessage);
          await recordUsage({ identityKey, fingerprint, provider: "local", outcome: "api_call_failed", wasOutboundCall: false, ...audit, durationMs, errorMessage });
          return { success: false, error: PROCESSING_FAILED_ERROR };
        }
        const uvLogoUrl = `data:image/png;base64,${arrayBufferToBase64(outputs.images.uvPng)}`;
        const laserLogoUrl = `data:image/png;base64,${arrayBufferToBase64(outputs.images.laserPng)}`;
        await finalizeSuccess(fingerprint, claimToken, { uvLogoUrl, laserLogoUrl, ...audit });
        console.log(`[logo-processing] local ${local.kind}: removed=${local.stats.removedPct}% kept=${local.stats.keptPct}% enclosed_bg=${local.stats.enclosedBackgroundPct}% work=${local.stats.workWidth}x${local.stats.workHeight}`);
        await recordUsage({ identityKey, fingerprint, provider: "local", outcome: "api_call_succeeded", wasOutboundCall: false, ...audit, durationMs });
        return { success: true, uvLogoUrl, laserLogoUrl };
      }

      const first = await attemptProvider(primary, image, base64Data);

      if (first.ok) {
        await finalizeSuccess(fingerprint, claimToken, { uvLogoUrl: first.uvLogoUrl, laserLogoUrl: first.laserLogoUrl, ...apiAuditFields(first.api) });
        await recordUsage({
          identityKey, fingerprint, provider: primary.provider.id, outcome: "api_call_succeeded", wasOutboundCall: true,
          ...apiAuditFields(first.api), durationMs: first.durationMs,
        });
        return { success: true, uvLogoUrl: first.uvLogoUrl, laserLogoUrl: first.laserLogoUrl };
      }

      await recordUsage({
        identityKey, fingerprint, provider: primary.provider.id, outcome: "api_call_failed", wasOutboundCall: first.reachedProvider,
        ...apiAuditFields(first.api), durationMs: first.durationMs, errorMessage: first.errorMessage,
      });

      const fallback = plan.fallback;
      if (!fallback) {
        await finalizeFailure(fingerprint, claimToken, first.errorMessage);
        return { success: false, error: PROCESSING_FAILED_ERROR };
      }

      // ONE fallback attempt, never a loop. The primary's own cache row is
      // always finalized as FAILED here (even if the fallback succeeds), so
      // a fallback result is never stored under the primary provider's
      // fingerprint and a later upload retries the primary.
      const fallbackFingerprint = computeFingerprint(image.bytes, fallback.provider.cacheVariant);
      const cachedFallback = await lookupCachedResult(fallbackFingerprint);
      if (cachedFallback.kind === "hit") {
        // The fallback provider already processed this exact image (e.g. a
        // pre-existing remove.bg cache entry): reuse it, no paid call.
        await finalizeFailure(fingerprint, claimToken, `${first.errorMessage}; served cached ${fallback.provider.displayName} result`);
        await recordUsage({ identityKey, fingerprint: fallbackFingerprint, provider: fallback.provider.id, outcome: "cache_hit", wasOutboundCall: false });
        return { success: true, uvLogoUrl: cachedFallback.row.uv_logo_url!, laserLogoUrl: cachedFallback.row.laser_logo_url! };
      }

      // Keep our claim alive across the second call so a duplicate upload
      // can't reclaim the row (and pay again) while we're still working.
      await extendClaimLease(fingerprint, claimToken, getLeaseDurationSeconds());
      console.warn(`[logo-processing] ${primary.provider.displayName} failed; trying ${fallback.provider.displayName} fallback once.`);
      const second = await attemptProvider(fallback, image, base64Data);

      if (!second.ok) {
        await finalizeFailure(fingerprint, claimToken, `${first.errorMessage}; fallback: ${second.errorMessage}`);
        await recordUsage({
          identityKey, fingerprint: fallbackFingerprint, provider: fallback.provider.id, outcome: "api_call_failed", wasOutboundCall: second.reachedProvider,
          ...apiAuditFields(second.api), durationMs: second.durationMs, errorMessage: second.errorMessage,
        });
        return { success: false, error: PROCESSING_FAILED_ERROR };
      }

      await finalizeFailure(fingerprint, claimToken, `${first.errorMessage}; served by ${fallback.provider.displayName} fallback`);
      // Cached under the FALLBACK provider's own fingerprint (only if no row
      // exists yet), so the next primary failure for this image reuses it.
      await cacheResultIfAbsent(fallbackFingerprint, { uvLogoUrl: second.uvLogoUrl, laserLogoUrl: second.laserLogoUrl, ...apiAuditFields(second.api) });
      await recordUsage({
        identityKey, fingerprint: fallbackFingerprint, provider: fallback.provider.id, outcome: "api_call_succeeded", wasOutboundCall: true,
        ...apiAuditFields(second.api), durationMs: second.durationMs,
      });
      return { success: true, uvLogoUrl: second.uvLogoUrl, laserLogoUrl: second.laserLogoUrl };
    } catch (e: any) {
      if (fingerprint && claimToken) {
        await finalizeFailure(fingerprint, claimToken, e?.message || String(e));
      }
      console.error("[logo-processing] unexpected error:", e?.message || String(e));
      return { success: false, error: PROCESSING_FAILED_ERROR };
    } finally {
      if (slotId) await releaseConcurrentSlot(slotId);
    }
}
