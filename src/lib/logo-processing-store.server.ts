// Thin wrapper around the raw Supabase I/O for the remove.bg safeguards
// (supabase/migrations/20261021140000_add_logo_processing_safeguards.sql
// and .../20261021143000_add_logo_processing_atomic_quota.sql). Kept
// separate from logo-processing-safeguards.server.ts (which owns the
// claim/poll/reclaim state machine and the overall fail-closed decisions)
// so tests can `mock.module` this exact import path -- the same
// convention b2b-company-setup.functions.test.mjs uses for
// shopify-admin.server -- instead of having to fake Supabase's whole
// chainable query-builder surface just to exercise the safeguard logic.
//
// Every function here returns an explicit `{ ok: false; reason:
// "unavailable" }` instead of silently treating a missing/unreachable
// Supabase client the same as "nothing to worry about" -- local dev has
// no SUPABASE_SERVICE_ROLE_KEY (confirmed absent from this project's
// .env; Lovable Cloud's preview/live environment does have it, since
// several other existing server functions already depend on it and work
// in production), and `supabaseAdmin` throws synchronously on first
// property access when it's missing. The caller
// (logo-processing-safeguards.server.ts) treats "unavailable" as a reason
// to REJECT the request rather than let it through uncounted.

export interface CacheRow {
  fingerprint: string;
  status: "in_progress" | "succeeded" | "failed";
  owner_token: string | null;
  lease_expires_at: string | null;
  uv_logo_url: string | null;
  laser_logo_url: string | null;
  credits_charged: string | null;
  response_type: string | null;
  response_width: string | null;
  response_height: string | null;
  error_message: string | null;
}

export interface UsageRowInput {
  identity_key: string;
  fingerprint: string | null;
  outcome: string;
  was_outbound_call: boolean;
  credits_charged: string | null;
  response_type: string | null;
  response_width: string | null;
  response_height: string | null;
  duration_ms: number | null;
  error_message: string | null;
}

export type StoreOutcome<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: "unavailable"; errorMessage: string };

async function getClientOrNull(): Promise<typeof import("@/integrations/supabase/client.server").supabaseAdmin | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    void supabaseAdmin.from; // constructs the lazy client; throws here if misconfigured
    return supabaseAdmin;
  } catch (err) {
    console.warn(
      "[logo-processing-store] Supabase unavailable:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/** ok:true means we won the claim. ok:false + reason:"conflict" means a
 * unique-violation (23505) -- someone else already holds this
 * fingerprint, a NORMAL outcome the caller handles (read the existing
 * row). ok:false + reason:"unavailable" means we genuinely couldn't talk
 * to the store at all -- the caller must fail closed on this. */
export async function insertCacheInProgress(
  fingerprint: string,
  ownerToken: string,
  leaseDurationSeconds: number = 60,
): Promise<{ ok: true } | { ok: false; reason: "conflict" } | { ok: false; reason: "unavailable"; errorMessage: string }> {
  const supabase = await getClientOrNull();
  if (!supabase) return { ok: false, reason: "unavailable", errorMessage: "store unavailable" };
  const leaseExpiresAt = new Date(Date.now() + leaseDurationSeconds * 1000).toISOString();
  const { error } = await supabase.from("logo_processing_cache").insert({
    fingerprint,
    status: "in_progress",
    owner_token: ownerToken,
    lease_expires_at: leaseExpiresAt,
  });
  if (!error) return { ok: true };
  if (error.code === "23505") return { ok: false, reason: "conflict" };
  return { ok: false, reason: "unavailable", errorMessage: error.message };
}

export async function getCacheRow(fingerprint: string): Promise<StoreOutcome<{ row: CacheRow | null }>> {
  const supabase = await getClientOrNull();
  if (!supabase) return { ok: false, reason: "unavailable", errorMessage: "store unavailable" };
  const { data, error } = await supabase.from("logo_processing_cache").select("*").eq("fingerprint", fingerprint).maybeSingle();
  if (error) return { ok: false, reason: "unavailable", errorMessage: error.message };
  return { ok: true, row: (data as CacheRow | null) ?? null };
}

/** reclaimed:true only if THIS call is the one that flipped a 'failed'
 * row back to 'in_progress' (guarded by `.eq("status", "failed")` so a
 * concurrent reclaim attempt by another request can't both "win"). */
export async function reclaimFailedCacheRow(
  fingerprint: string,
  ownerToken: string,
  leaseDurationSeconds: number = 60,
): Promise<StoreOutcome<{ reclaimed: boolean }>> {
  const supabase = await getClientOrNull();
  if (!supabase) return { ok: false, reason: "unavailable", errorMessage: "store unavailable" };
  const leaseExpiresAt = new Date(Date.now() + leaseDurationSeconds * 1000).toISOString();
  const { data, error } = await supabase
    .from("logo_processing_cache")
    .update({
      status: "in_progress",
      owner_token: ownerToken,
      lease_expires_at: leaseExpiresAt,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("fingerprint", fingerprint)
    .eq("status", "failed")
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable", errorMessage: error.message };
  return { ok: true, reclaimed: Boolean(data) };
}

/** Atomically reclaims a stale in-progress cache row whose lease has expired.
 * Guarded by lease_expires_at <= now() in the database RPC. */
export async function reclaimStaleCacheRow(
  fingerprint: string,
  ownerToken: string,
  leaseDurationSeconds: number = 60,
): Promise<StoreOutcome<{ reclaimed: boolean }>> {
  const supabase = await getClientOrNull();
  if (!supabase) return { ok: false, reason: "unavailable", errorMessage: "store unavailable" };
  const { data, error } = await supabase.rpc("reclaim_stale_logo_processing_cache", {
    p_fingerprint: fingerprint,
    p_owner_token: ownerToken,
    p_lease_seconds: leaseDurationSeconds,
  });
  if (error) return { ok: false, reason: "unavailable", errorMessage: error.message };
  return { ok: true, reclaimed: Boolean(data) };
}

/** Allows active owner to extend its lease if processing is taking longer. */
export async function extendLease(
  fingerprint: string,
  ownerToken: string,
  extensionSeconds: number = 60,
): Promise<StoreOutcome<{ extended: boolean }>> {
  const supabase = await getClientOrNull();
  if (!supabase) return { ok: false, reason: "unavailable", errorMessage: "store unavailable" };
  const { data, error } = await supabase.rpc("extend_logo_processing_lease", {
    p_fingerprint: fingerprint,
    p_owner_token: ownerToken,
    p_extension_seconds: extensionSeconds,
  });
  if (error) return { ok: false, reason: "unavailable", errorMessage: error.message };
  return { ok: true, extended: Boolean(data) };
}

/** Finalizes cache row as succeeded. Guarded by owner_token to ensure
 * late/revived workers whose lease expired cannot overwrite a reclaimed record. */
export async function updateCacheRowSucceeded(
  fingerprint: string,
  ownerToken: string,
  fields: { uv_logo_url: string; laser_logo_url: string; credits_charged: string | null; response_type: string | null; response_width: string | null; response_height: string | null },
): Promise<void> {
  const supabase = await getClientOrNull();
  if (!supabase) return;
  const { error } = await supabase
    .from("logo_processing_cache")
    .update({
      status: "succeeded",
      ...fields,
      owner_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("fingerprint", fingerprint)
    .eq("owner_token", ownerToken);
  if (error) console.warn("[logo-processing-store] failed to persist success:", error.message);
}

/** Finalizes cache row as failed. Guarded by owner_token so only the active
 * owner can record the failure. */
export async function updateCacheRowFailed(
  fingerprint: string,
  ownerToken: string,
  errorMessage: string,
): Promise<void> {
  const supabase = await getClientOrNull();
  if (!supabase) return;
  const { error } = await supabase
    .from("logo_processing_cache")
    .update({
      status: "failed",
      error_message: errorMessage,
      owner_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("fingerprint", fingerprint)
    .eq("owner_token", ownerToken);
  if (error) console.warn("[logo-processing-store] failed to persist failure:", error.message);
}

/** Atomically reserves one slot against BOTH the global and per-identity
 * daily cap via reserve_logo_processing_daily_quota. */
export async function reserveDailyQuota(
  identityKey: string,
  userDailyLimit: number,
  globalDailyLimit: number,
): Promise<{ ok: true } | { ok: false; reason: "over_limit"; scope: "user" | "global" } | { ok: false; reason: "unavailable"; errorMessage: string }> {
  const supabase = await getClientOrNull();
  if (!supabase) return { ok: false, reason: "unavailable", errorMessage: "store unavailable" };
  const { data, error } = await supabase.rpc("reserve_logo_processing_daily_quota", {
    p_identity_key: identityKey,
    p_user_daily_limit: userDailyLimit,
    p_global_daily_limit: globalDailyLimit,
  });
  if (error) return { ok: false, reason: "unavailable", errorMessage: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, reason: "unavailable", errorMessage: "reserve_logo_processing_daily_quota returned no row" };
  if (row.reserved) return { ok: true };
  return { ok: false, reason: "over_limit", scope: row.rejected_scope === "user" ? "user" : "global" };
}

/** Atomically reserves an expiring concurrency lease for this identity via
 * reserve_logo_processing_concurrency_slot. Expired leases for this identity are
 * cleaned up automatically on reservation. Returns slotId on success. */
export async function reserveConcurrencySlot(
  identityKey: string,
  limit: number,
  leaseSeconds: number = 60,
): Promise<{ ok: true; slotId: string } | { ok: false; reason: "over_limit" } | { ok: false; reason: "unavailable"; errorMessage: string }> {
  const supabase = await getClientOrNull();
  if (!supabase) return { ok: false, reason: "unavailable", errorMessage: "store unavailable" };
  const { data, error } = await supabase.rpc("reserve_logo_processing_concurrency_slot", {
    p_identity_key: identityKey,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });
  if (error) return { ok: false, reason: "unavailable", errorMessage: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, reason: "unavailable", errorMessage: "no row returned" };
  if (row.reserved && row.slot_id) return { ok: true, slotId: row.slot_id };
  return { ok: false, reason: "over_limit" };
}

/** Releases a concurrency lease by slot_id. Fully idempotent. */
export async function releaseConcurrencySlot(slotId: string): Promise<void> {
  const supabase = await getClientOrNull();
  if (!supabase) {
    console.warn("[logo-processing-store] cannot release concurrency slot -- store unavailable; it will expire naturally after lease timeout");
    return;
  }
  const { error } = await supabase.rpc("release_logo_processing_concurrency_slot", { p_slot_id: slotId });
  if (error) console.warn("[logo-processing-store] failed to release concurrency slot:", error.message);
}

export async function insertUsageRow(entry: UsageRowInput): Promise<void> {
  const supabase = await getClientOrNull();
  if (!supabase) return;
  const { error } = await supabase.from("logo_processing_usage").insert(entry);
  if (error) console.warn("[logo-processing-store] failed to write usage row:", error.message);
}
