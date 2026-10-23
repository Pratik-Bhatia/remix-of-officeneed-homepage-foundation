// Server-side dedup/cache/usage-cap safeguards for the remove.bg
// integration (processLogoServer, logo-processing-core.server.ts).
//
// This module owns the DECISIONS (claim/poll/reclaim state machine, daily
// and global cap checks, concurrency reservation); the actual Supabase
// reads/writes live in logo-processing-store.server.ts, kept separate so
// tests can mock that thin I/O boundary directly instead of faking
// Supabase's whole chainable query-builder surface.
//
// Storage model:
// - logo_processing_cache (20261021140000_add_logo_processing_safeguards.sql):
//   ONE row per distinct uploaded image, keyed by a content fingerprint
//   computed from the actual validated bytes (never a client-supplied
//   value -- see computeFingerprint's caller). Its PRIMARY KEY on
//   fingerprint is what makes claiming a slot atomic: two concurrent
//   requests for the identical file both attempt the same INSERT;
//   Postgres guarantees only one succeeds.
//   Includes owner_token and lease_expires_at for safe time-bounded leases:
//   - An active request (lease_expires_at > now()) is strictly protected from reclamation.
//   - A crashed or abandoned Worker's record (lease_expires_at <= now()) can be
//     atomically reclaimed by a subsequent request via reclaimStaleCacheRow.
//   - Finalizing (success or failure) requires the matching owner_token, preventing
//     late or revived workers from overwriting a reclaimed record.
// - logo_processing_daily_counters / logo_processing_concurrency_slots
//   (20261021143000_add_logo_processing_atomic_quota.sql):
//   - Atomic, race-free daily counters backing the daily/global caps via
//     reserve_logo_processing_daily_quota (INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit).
//   - Expiring concurrency leases in logo_processing_concurrency_slots.
//     Each in-flight request holds a slot_id lease with an expires_at timestamp.
//     Expired slots are purged automatically, and active requests hold their slot
//     until explicitly released or until lease expiration.
// - logo_processing_usage: one row per processing ATTEMPT (including a
//   cache hit or a validation/rate-limit rejection), the audit trail.
//
// Fail-closed policy: every check in this module that depends on
// Supabase returns an explicit "unavailable" outcome when the store can't
// be reached, and claimProcessingSlot propagates that straight back as
// ClaimOutcome's "unavailable" kind -- logo-processing-core.server.ts
// turns that into a clear "temporarily unavailable" error WITHOUT ever
// calling remove.bg.

import { createHash } from "node:crypto";
import {
  insertCacheInProgress,
  getCacheRow,
  reclaimFailedCacheRow,
  reclaimStaleCacheRow,
  updateCacheRowSucceeded,
  updateCacheRowFailed,
  reserveDailyQuota,
  reserveConcurrencySlot,
  releaseConcurrencySlot,
  insertUsageRow,
  type CacheRow,
} from "@/lib/logo-processing-store.server";

export const DEFAULT_USER_DAILY_LIMIT = 10;
export const DEFAULT_USER_CONCURRENT_LIMIT = 3;
export const DEFAULT_GLOBAL_DAILY_LIMIT = 200;
export const DEFAULT_CACHE_POLL_INTERVAL_MS = 500;
export const DEFAULT_CACHE_POLL_TIMEOUT_MS = 20_000;
export const DEFAULT_LEASE_DURATION_SECONDS = 60;
export const DEFAULT_CONCURRENCY_LEASE_SECONDS = 60;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getUserDailyLimit(): number {
  return envInt("LOGO_PROCESSING_USER_DAILY_LIMIT", DEFAULT_USER_DAILY_LIMIT);
}
export function getUserConcurrentLimit(): number {
  return envInt("LOGO_PROCESSING_USER_CONCURRENT_LIMIT", DEFAULT_USER_CONCURRENT_LIMIT);
}
export function getGlobalDailyLimit(): number {
  return envInt("LOGO_PROCESSING_GLOBAL_DAILY_LIMIT", DEFAULT_GLOBAL_DAILY_LIMIT);
}
export function getLeaseDurationSeconds(): number {
  return envInt("LOGO_PROCESSING_LEASE_SECONDS", DEFAULT_LEASE_DURATION_SECONDS);
}
export function getConcurrencyLeaseSeconds(): number {
  return envInt("LOGO_PROCESSING_CONCURRENCY_LEASE_SECONDS", DEFAULT_CONCURRENCY_LEASE_SECONDS);
}

// Overridable so tests can shrink these from the real 500ms/20s defaults
// instead of actually waiting on them.
function getCachePollIntervalMs(): number {
  return envInt("LOGO_PROCESSING_POLL_INTERVAL_MS", DEFAULT_CACHE_POLL_INTERVAL_MS);
}
function getCachePollTimeoutMs(): number {
  return envInt("LOGO_PROCESSING_POLL_TIMEOUT_MS", DEFAULT_CACHE_POLL_TIMEOUT_MS);
}

/** Never store or log a raw IP -- a salted one-way hash is enough to count
 * requests per requester without keeping PII around. */
export function hashIdentityKey(rawIdentity: string): string {
  const salt = process.env["LOGO_PROCESSING_IDENTITY_SALT"] || "officeneed-logo-processing";
  return createHash("sha256").update(`${salt}:${rawIdentity}`).digest("hex");
}

/** Computed from the actual validated upload bytes plus the exact
 * remove.bg parameters that affect the output (today, just `size`). */
export function computeFingerprint(bytes: Uint8Array, size: "small" | "auto"): string {
  return createHash("sha256").update(size).update(bytes).digest("hex");
}

export function generateOwnerToken(): string {
  return createHash("sha256")
    .update(`${Math.random()}:${Date.now()}:${process.pid ?? 0}`)
    .digest("hex");
}

export type ConcurrencyReservation =
  | { kind: "reserved"; slotId: string }
  | { kind: "over_limit" }
  | { kind: "unavailable" };

/** Cross-instance-safe expiring lease reservation.
 * Expired slots are purged automatically upon reservation, so crashed
 * workers cannot permanently lock an identity out. */
export async function tryReserveConcurrentSlot(identityKey: string): Promise<ConcurrencyReservation> {
  const result = await reserveConcurrencySlot(
    identityKey,
    getUserConcurrentLimit(),
    getConcurrencyLeaseSeconds(),
  );
  if (result.ok) return { kind: "reserved", slotId: result.slotId };
  if (result.reason === "over_limit") return { kind: "over_limit" };
  return { kind: "unavailable" };
}

export async function releaseConcurrentSlot(slotId: string): Promise<void> {
  await releaseConcurrencySlot(slotId);
}

export type ClaimOutcome =
  | { kind: "claimed"; ownerToken: string }
  | { kind: "cache_hit"; row: CacheRow }
  | { kind: "failed_upstream"; row: CacheRow }
  | { kind: "timed_out_waiting" }
  | { kind: "over_daily_limit"; scope: "user" | "global" }
  | { kind: "unavailable" };

/** Reserves the daily quota for a slot we're about to actually use (a
 * fresh claim, a reclaimed failed row, or a reclaimed stale row). If the quota is
 * unavailable, the fingerprint claim itself is marked failed using ownerToken so
 * a later attempt isn't blocked by our own abandoned in_progress claim. */
async function reserveQuotaOrReleaseClaim(
  fingerprint: string,
  ownerToken: string,
  identityKey: string,
): Promise<ClaimOutcome | null> {
  const quota = await reserveDailyQuota(identityKey, getUserDailyLimit(), getGlobalDailyLimit());
  if (quota.ok) return null; // null = proceed, caller returns {kind:"claimed", ownerToken}
  if (quota.reason === "over_limit") {
    await updateCacheRowFailed(fingerprint, ownerToken, `over ${quota.scope} daily limit`);
    return { kind: "over_daily_limit", scope: quota.scope };
  }
  await updateCacheRowFailed(fingerprint, ownerToken, "daily quota store unavailable");
  return { kind: "unavailable" };
}

/** Attempts to become the one request that actually calls remove.bg for
 * this fingerprint.
 * - If a row does not exist, claims it with a time-bounded lease and unique ownerToken.
 * - If a row exists with status='succeeded', returns cache_hit.
 * - If a row exists with status='failed', reclaims it for a fresh retry.
 * - If a row exists with status='in_progress':
 *   * If lease_expires_at <= now() (stale lease from a crashed worker), atomically
 *     reclaims the row via reclaimStaleCacheRow.
 *   * If lease_expires_at > now() (active lease), polls until it resolves or deadline elapses.
 * - Never triggers a second remove.bg call while an active request is running. */
export async function claimProcessingSlot(fingerprint: string, identityKey: string): Promise<ClaimOutcome> {
  const deadline = Date.now() + getCachePollTimeoutMs();
  const ownerToken = generateOwnerToken();
  const leaseSeconds = getLeaseDurationSeconds();

  for (;;) {
    const inserted = await insertCacheInProgress(fingerprint, ownerToken, leaseSeconds);
    if (inserted.ok) {
      const rejection = await reserveQuotaOrReleaseClaim(fingerprint, ownerToken, identityKey);
      return rejection ?? { kind: "claimed", ownerToken };
    }
    if (inserted.reason === "unavailable") return { kind: "unavailable" };

    // inserted.reason === "conflict": row already exists.
    const existing = await getCacheRow(fingerprint);
    if (!existing.ok) return { kind: "unavailable" };
    if (!existing.row) return { kind: "unavailable" };

    if (existing.row.status === "succeeded") return { kind: "cache_hit", row: existing.row };

    if (existing.row.status === "failed") {
      const reclaim = await reclaimFailedCacheRow(fingerprint, ownerToken, leaseSeconds);
      if (!reclaim.ok) return { kind: "unavailable" };
      if (reclaim.reclaimed) {
        const rejection = await reserveQuotaOrReleaseClaim(fingerprint, ownerToken, identityKey);
        return rejection ?? { kind: "claimed", ownerToken };
      }
      continue; // someone else reclaimed it first -- re-read and re-decide
    }

    // status === "in_progress": check whether the lease is stale
    if (existing.row.status === "in_progress") {
      const leaseExpiresAt = existing.row.lease_expires_at ? new Date(existing.row.lease_expires_at).getTime() : 0;
      const isStale = leaseExpiresAt > 0 && leaseExpiresAt <= Date.now();

      if (isStale) {
        const staleReclaim = await reclaimStaleCacheRow(fingerprint, ownerToken, leaseSeconds);
        if (!staleReclaim.ok) return { kind: "unavailable" };
        if (staleReclaim.reclaimed) {
          const rejection = await reserveQuotaOrReleaseClaim(fingerprint, ownerToken, identityKey);
          return rejection ?? { kind: "claimed", ownerToken };
        }
        // someone else reclaimed it first -- loop again to check new status
        continue;
      }

      // Lease is still ACTIVE: an active request is running. Wait and poll.
      if (Date.now() >= deadline) return { kind: "timed_out_waiting" };
      await new Promise((resolve) => setTimeout(resolve, getCachePollIntervalMs()));
      const resolved = await getCacheRow(fingerprint);
      if (!resolved.ok) return { kind: "unavailable" };
      if (resolved.row) {
        if (resolved.row.status === "succeeded") return { kind: "cache_hit", row: resolved.row };
        if (resolved.row.status === "failed") return { kind: "failed_upstream", row: resolved.row };
        // still in_progress -- continue loop
      }
    }
  }
}

export async function finalizeSuccess(
  fingerprint: string,
  ownerToken: string,
  result: { uvLogoUrl: string; laserLogoUrl: string; creditsCharged: string | null; responseType: string | null; responseWidth: string | null; responseHeight: string | null },
): Promise<void> {
  await updateCacheRowSucceeded(fingerprint, ownerToken, {
    uv_logo_url: result.uvLogoUrl,
    laser_logo_url: result.laserLogoUrl,
    credits_charged: result.creditsCharged,
    response_type: result.responseType,
    response_width: result.responseWidth,
    response_height: result.responseHeight,
  });
}

export async function finalizeFailure(
  fingerprint: string,
  ownerToken: string,
  errorMessage: string,
): Promise<void> {
  await updateCacheRowFailed(fingerprint, ownerToken, errorMessage);
}

export interface UsageLogEntry {
  identityKey: string;
  fingerprint: string | null;
  outcome: "validation_rejected" | "rate_limited" | "cache_hit" | "api_call_succeeded" | "api_call_failed" | "unavailable";
  wasOutboundCall: boolean;
  creditsCharged?: string | null;
  responseType?: string | null;
  responseWidth?: string | null;
  responseHeight?: string | null;
  durationMs?: number;
  errorMessage?: string;
}

export async function recordUsage(entry: UsageLogEntry): Promise<void> {
  const logLine = `[remove.bg] outcome=${entry.outcome} outbound=${entry.wasOutboundCall} credits_charged=${entry.creditsCharged ?? "n/a"} type=${entry.responseType ?? "n/a"} width=${entry.responseWidth ?? "n/a"} height=${entry.responseHeight ?? "n/a"} duration_ms=${entry.durationMs ?? "n/a"} fingerprint=${entry.fingerprint?.slice(0, 12) ?? "n/a"}`;
  console.log(logLine);
  await insertUsageRow({
    identity_key: entry.identityKey,
    fingerprint: entry.fingerprint,
    outcome: entry.outcome,
    was_outbound_call: entry.wasOutboundCall,
    credits_charged: entry.creditsCharged ?? null,
    response_type: entry.responseType ?? null,
    response_width: entry.responseWidth ?? null,
    response_height: entry.responseHeight ?? null,
    duration_ms: entry.durationMs ?? null,
    error_message: entry.errorMessage ?? null,
  });
}
