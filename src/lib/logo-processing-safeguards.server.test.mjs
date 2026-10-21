// Regression tests for src/lib/logo-processing-safeguards.server.ts --
// the claim/poll/reclaim state machine, atomic daily/global usage caps,
// expiring concurrency leases, stale in-progress cache recovery, and fail-closed policy.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/logo-processing-safeguards.server.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.LOGO_PROCESSING_POLL_INTERVAL_MS = "10";
process.env.LOGO_PROCESSING_POLL_TIMEOUT_MS = "60";
process.env.LOGO_PROCESSING_LEASE_SECONDS = "1";
process.env.LOGO_PROCESSING_CONCURRENCY_LEASE_SECONDS = "1";

/** In-memory fake of both migrations' tables, implementing the SAME
 * lease-expiry, ownership-token, and all-or-nothing/atomic semantics
 * the real Postgres functions provide. */
function makeFakeStore() {
  const cache = new Map(); // fingerprint -> CacheRow
  const usageRows = [];
  const dailyCounters = new Map(); // `${scope}:${scopeKey}` -> count
  const concurrencySlots = new Map(); // slotId -> { slotId, identityKey, expiresAt }
  let unavailable = false; // flips every store call to "unavailable" when true

  return {
    cache, usageRows, dailyCounters, concurrencySlots,
    setUnavailable(v) { unavailable = v; },

    insertCacheInProgress: async (fingerprint, ownerToken, leaseDurationSeconds = 60) => {
      if (unavailable) return { ok: false, reason: "unavailable", errorMessage: "fake store down" };
      if (cache.has(fingerprint)) return { ok: false, reason: "conflict" };
      const leaseExpiresAt = new Date(Date.now() + leaseDurationSeconds * 1000).toISOString();
      cache.set(fingerprint, {
        fingerprint, status: "in_progress",
        owner_token: ownerToken,
        lease_expires_at: leaseExpiresAt,
        uv_logo_url: null, laser_logo_url: null,
        credits_charged: null, response_type: null, response_width: null, response_height: null,
        error_message: null,
      });
      return { ok: true };
    },
    getCacheRow: async (fingerprint) => {
      if (unavailable) return { ok: false, reason: "unavailable", errorMessage: "fake store down" };
      return { ok: true, row: cache.get(fingerprint) ?? null };
    },
    reclaimFailedCacheRow: async (fingerprint, ownerToken, leaseDurationSeconds = 60) => {
      if (unavailable) return { ok: false, reason: "unavailable", errorMessage: "fake store down" };
      const row = cache.get(fingerprint);
      if (row?.status !== "failed") return { ok: true, reclaimed: false };
      row.status = "in_progress";
      row.owner_token = ownerToken;
      row.lease_expires_at = new Date(Date.now() + leaseDurationSeconds * 1000).toISOString();
      row.error_message = null;
      return { ok: true, reclaimed: true };
    },
    reclaimStaleCacheRow: async (fingerprint, ownerToken, leaseDurationSeconds = 60) => {
      if (unavailable) return { ok: false, reason: "unavailable", errorMessage: "fake store down" };
      const row = cache.get(fingerprint);
      if (row?.status !== "in_progress") return { ok: true, reclaimed: false };
      const expiresAt = row.lease_expires_at ? new Date(row.lease_expires_at).getTime() : 0;
      if (expiresAt > Date.now()) {
        // Active lease -- strictly protected, cannot reclaim!
        return { ok: true, reclaimed: false };
      }
      row.owner_token = ownerToken;
      row.lease_expires_at = new Date(Date.now() + leaseDurationSeconds * 1000).toISOString();
      return { ok: true, reclaimed: true };
    },
    extendLease: async (fingerprint, ownerToken, extensionSeconds = 60) => {
      if (unavailable) return { ok: false, reason: "unavailable", errorMessage: "fake store down" };
      const row = cache.get(fingerprint);
      if (!row || row.status !== "in_progress" || row.owner_token !== ownerToken) {
        return { ok: true, extended: false };
      }
      row.lease_expires_at = new Date(Date.now() + extensionSeconds * 1000).toISOString();
      return { ok: true, extended: true };
    },
    updateCacheRowSucceeded: async (fingerprint, ownerToken, fields) => {
      const row = cache.get(fingerprint);
      // Guarded by owner_token -- late/revived workers cannot overwrite!
      if (row && row.owner_token === ownerToken) {
        Object.assign(row, { status: "succeeded", ...fields, owner_token: null, lease_expires_at: null });
      }
    },
    updateCacheRowFailed: async (fingerprint, ownerToken, errorMessage) => {
      const row = cache.get(fingerprint);
      if (row && row.owner_token === ownerToken) {
        Object.assign(row, { status: "failed", error_message: errorMessage, owner_token: null, lease_expires_at: null });
      }
    },
    reserveDailyQuota: async (identityKey, userLimit, globalLimit) => {
      if (unavailable) return { ok: false, reason: "unavailable", errorMessage: "fake store down" };
      const globalKey = "global:global";
      const globalCount = dailyCounters.get(globalKey) ?? 0;
      if (globalCount >= globalLimit) return { ok: false, reason: "over_limit", scope: "global" };
      const userKey = `user:${identityKey}`;
      const userCount = dailyCounters.get(userKey) ?? 0;
      if (userCount >= userLimit) return { ok: false, reason: "over_limit", scope: "user" };
      dailyCounters.set(globalKey, globalCount + 1);
      dailyCounters.set(userKey, userCount + 1);
      return { ok: true };
    },
    reserveConcurrencySlot: async (identityKey, limit, leaseSeconds = 60) => {
      if (unavailable) return { ok: false, reason: "unavailable", errorMessage: "fake store down" };
      const now = Date.now();
      // Purge expired slots for this identity
      for (const [slotId, slot] of concurrencySlots.entries()) {
        if (slot.identityKey === identityKey && slot.expiresAt <= now) {
          concurrencySlots.delete(slotId);
        }
      }
      let activeCount = 0;
      for (const slot of concurrencySlots.values()) {
        if (slot.identityKey === identityKey) activeCount++;
      }
      if (activeCount >= limit) return { ok: false, reason: "over_limit" };
      const slotId = "slot-" + Math.random().toString(36).slice(2);
      concurrencySlots.set(slotId, { slotId, identityKey, expiresAt: now + leaseSeconds * 1000 });
      return { ok: true, slotId };
    },
    releaseConcurrencySlot: async (slotId) => {
      concurrencySlots.delete(slotId);
    },
    insertUsageRow: async (entry) => { usageRows.push(entry); },
  };
}

let fake = makeFakeStore();

mock.module("@/lib/logo-processing-store.server", {
  namedExports: {
    insertCacheInProgress: (fp, tok, l) => fake.insertCacheInProgress(fp, tok, l),
    getCacheRow: (fp) => fake.getCacheRow(fp),
    reclaimFailedCacheRow: (fp, tok, l) => fake.reclaimFailedCacheRow(fp, tok, l),
    reclaimStaleCacheRow: (fp, tok, l) => fake.reclaimStaleCacheRow(fp, tok, l),
    extendLease: (fp, tok, ext) => fake.extendLease(fp, tok, ext),
    updateCacheRowSucceeded: (fp, tok, f) => fake.updateCacheRowSucceeded(fp, tok, f),
    updateCacheRowFailed: (fp, tok, e) => fake.updateCacheRowFailed(fp, tok, e),
    reserveDailyQuota: (id, u, g) => fake.reserveDailyQuota(id, u, g),
    reserveConcurrencySlot: (id, l, sec) => fake.reserveConcurrencySlot(id, l, sec),
    releaseConcurrencySlot: (slotId) => fake.releaseConcurrencySlot(slotId),
    insertUsageRow: (e) => fake.insertUsageRow(e),
  },
});

const safeguards = await import("./logo-processing-safeguards.server");
const {
  claimProcessingSlot, finalizeSuccess, finalizeFailure, recordUsage,
  hashIdentityKey, computeFingerprint,
  tryReserveConcurrentSlot, releaseConcurrentSlot,
  getUserDailyLimit, getUserConcurrentLimit, getGlobalDailyLimit,
} = safeguards;

function reset() {
  fake = makeFakeStore();
}

// --- hashIdentityKey / computeFingerprint ---

test("hashIdentityKey is deterministic and never returns the raw input", () => {
  const a = hashIdentityKey("1.2.3.4");
  const b = hashIdentityKey("1.2.3.4");
  assert.equal(a, b);
  assert.notEqual(a, "1.2.3.4");
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("computeFingerprint: identical bytes + size always produce the identical fingerprint; different bytes/size do not", () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  assert.equal(computeFingerprint(bytes, "small"), computeFingerprint(new Uint8Array([1, 2, 3, 4, 5]), "small"));
  assert.notEqual(computeFingerprint(bytes, "small"), computeFingerprint(new Uint8Array([1, 2, 4]), "small"));
  assert.notEqual(computeFingerprint(bytes, "small"), computeFingerprint(bytes, "auto"));
});

// --- Supabase-backed concurrency reservation (expiring leases) ---

test("tryReserveConcurrentSlot allows up to the configured limit, then refuses with kind='over_limit'", async () => {
  reset();
  const limit = getUserConcurrentLimit();
  const slotIds = [];
  for (let i = 0; i < limit; i++) {
    const r = await tryReserveConcurrentSlot("user-a");
    assert.equal(r.kind, "reserved", `slot ${i} should be reservable`);
    if (r.kind === "reserved") slotIds.push(r.slotId);
  }
  const over = await tryReserveConcurrentSlot("user-a");
  assert.equal(over.kind, "over_limit");
});

test("releaseConcurrentSlot frees a slot for a later reservation (concurrency recovery)", async () => {
  reset();
  const limit = getUserConcurrentLimit();
  let firstSlotId = "";
  for (let i = 0; i < limit; i++) {
    const r = await tryReserveConcurrentSlot("user-b");
    if (i === 0 && r.kind === "reserved") firstSlotId = r.slotId;
  }
  assert.equal((await tryReserveConcurrentSlot("user-b")).kind, "over_limit");
  await releaseConcurrentSlot(firstSlotId);
  assert.equal((await tryReserveConcurrentSlot("user-b")).kind, "reserved");
});

test("abandoned concurrency slot: expires automatically after lease timeout without permanently blocking user", async () => {
  reset();
  const limit = getUserConcurrentLimit();
  // Fill all slots with an artificially expired timestamp (simulating crashed workers)
  for (let i = 0; i < limit; i++) {
    const slotId = `abandoned-slot-${i}`;
    fake.concurrencySlots.set(slotId, {
      slotId,
      identityKey: "user-abandoned",
      expiresAt: Date.now() - 1000, // already expired!
    });
  }
  // The next reservation should automatically purge the expired slots and succeed
  const r = await tryReserveConcurrentSlot("user-abandoned");
  assert.equal(r.kind, "reserved");
  assert.equal(fake.concurrencySlots.size, 1);
});

test("concurrency release is idempotent: releasing an already-released slot is completely safe", async () => {
  reset();
  const r = await tryReserveConcurrentSlot("user-idem");
  assert.equal(r.kind, "reserved");
  if (r.kind === "reserved") {
    await releaseConcurrentSlot(r.slotId);
    await releaseConcurrentSlot(r.slotId); // second release
    assert.equal(fake.concurrencySlots.size, 0);
  }
});

test("tryReserveConcurrentSlot fails closed (kind='unavailable') when the store can't be reached", async () => {
  reset();
  fake.setUnavailable(true);
  const r = await tryReserveConcurrentSlot("user-e");
  assert.equal(r.kind, "unavailable");
});

// --- claimProcessingSlot: fresh claim, cache hit, reclaim-after-failure ---

test("claimProcessingSlot: a brand-new fingerprint is claimed with ownerToken and reserves daily quota", async () => {
  reset();
  const outcome = await claimProcessingSlot("fp-fresh", "id-1");
  assert.equal(outcome.kind, "claimed");
  assert.ok(outcome.ownerToken);
  assert.equal(fake.cache.get("fp-fresh").status, "in_progress");
  assert.equal(fake.cache.get("fp-fresh").owner_token, outcome.ownerToken);
  assert.equal(fake.dailyCounters.get("global:global"), 1);
  assert.equal(fake.dailyCounters.get("user:id-1"), 1);
});

test("claimProcessingSlot: an existing SUCCEEDED row is returned as a cache hit, and does NOT consume daily quota", async () => {
  reset();
  fake.cache.set("fp-done", {
    fingerprint: "fp-done", status: "succeeded",
    owner_token: null, lease_expires_at: null,
    uv_logo_url: "data:image/png;base64,UV", laser_logo_url: "data:image/png;base64,LASER",
    credits_charged: "0", response_type: "preview", response_width: "625", response_height: "400",
    error_message: null,
  });
  const outcome = await claimProcessingSlot("fp-done", "id-2");
  assert.equal(outcome.kind, "cache_hit");
  assert.equal(outcome.row.uv_logo_url, "data:image/png;base64,UV");
  assert.equal(fake.dailyCounters.size, 0, "a cache hit must never touch the daily quota counters");
});

test("claimProcessingSlot: an existing FAILED row is reclaimed for a fresh attempt (and DOES consume quota for the new attempt)", async () => {
  reset();
  fake.cache.set("fp-retry", {
    fingerprint: "fp-retry", status: "failed",
    owner_token: null, lease_expires_at: null,
    uv_logo_url: null, laser_logo_url: null,
    credits_charged: null, response_type: null, response_width: null, response_height: null,
    error_message: "earlier attempt failed",
  });
  const outcome = await claimProcessingSlot("fp-retry", "id-3");
  assert.equal(outcome.kind, "claimed");
  assert.ok(outcome.ownerToken);
  assert.equal(fake.cache.get("fp-retry").status, "in_progress");
  assert.equal(fake.cache.get("fp-retry").owner_token, outcome.ownerToken);
  assert.equal(fake.dailyCounters.get("user:id-3"), 1);
});

// --- Stale in-progress lease recovery vs active lease protection ---

test("stale in-progress recovery: an expired in-progress record is atomically reclaimed by a new request", async () => {
  reset();
  // Simulate a crashed worker: left status in_progress with an expired lease
  fake.cache.set("fp-crashed", {
    fingerprint: "fp-crashed",
    status: "in_progress",
    owner_token: "old-crashed-token",
    lease_expires_at: new Date(Date.now() - 5000).toISOString(), // expired 5s ago
    uv_logo_url: null, laser_logo_url: null,
    credits_charged: null, response_type: null, response_width: null, response_height: null,
    error_message: null,
  });

  const outcome = await claimProcessingSlot("fp-crashed", "id-recovery");
  assert.equal(outcome.kind, "claimed");
  assert.notEqual(outcome.ownerToken, "old-crashed-token", "must receive a fresh ownerToken");
  const row = fake.cache.get("fp-crashed");
  assert.equal(row.status, "in_progress");
  assert.equal(row.owner_token, outcome.ownerToken);
});

test("active lease protection: an active in-progress record (lease_expires_at > now()) is strictly protected and NOT reclaimed", async () => {
  reset();
  // An active request running right now with lease valid for 30s
  fake.cache.set("fp-active", {
    fingerprint: "fp-active",
    status: "in_progress",
    owner_token: "active-worker-token",
    lease_expires_at: new Date(Date.now() + 30000).toISOString(),
    uv_logo_url: null, laser_logo_url: null,
    credits_charged: null, response_type: null, response_width: null, response_height: null,
    error_message: null,
  });

  // Second worker arrives while the active request is still running
  const outcome = await claimProcessingSlot("fp-active", "id-other");
  // Must time out waiting for the active worker rather than reclaiming or making a duplicate call
  assert.equal(outcome.kind, "timed_out_waiting");
  assert.equal(fake.cache.get("fp-active").owner_token, "active-worker-token", "active owner must not be replaced");
});

test("owner token protection: a late/revived worker whose lease was reclaimed cannot overwrite the new owner", async () => {
  reset();
  fake.cache.set("fp-contested", {
    fingerprint: "fp-contested",
    status: "in_progress",
    owner_token: "new-owner-token", // reclaimed by new owner!
    lease_expires_at: new Date(Date.now() + 60000).toISOString(),
    uv_logo_url: null, laser_logo_url: null,
    credits_charged: null, response_type: null, response_width: null, response_height: null,
    error_message: null,
  });

  // Old revived worker attempts to finalize with its stale token
  await finalizeSuccess("fp-contested", "old-stale-token", {
    uvLogoUrl: "data:image/png;base64,OLD",
    laserLogoUrl: "data:image/png;base64,OLD",
    creditsCharged: "0", responseType: "preview", responseWidth: "1", responseHeight: "1",
  });

  // The row must NOT have been updated by the stale token!
  const row = fake.cache.get("fp-contested");
  assert.equal(row.status, "in_progress");
  assert.equal(row.uv_logo_url, null);

  // New owner finalizes with its valid token
  await finalizeSuccess("fp-contested", "new-owner-token", {
    uvLogoUrl: "data:image/png;base64,NEW",
    laserLogoUrl: "data:image/png;base64,NEW",
    creditsCharged: "0", responseType: "preview", responseWidth: "1", responseHeight: "1",
  });
  assert.equal(row.status, "succeeded");
  assert.equal(row.uv_logo_url, "data:image/png;base64,NEW");
});

// --- Concurrent duplicate polling ---

test("claimProcessingSlot: a concurrent duplicate for an IN-PROGRESS fingerprint polls and picks up the winner's eventual SUCCESS", async () => {
  reset();
  fake.cache.set("fp-inflight", {
    fingerprint: "fp-inflight", status: "in_progress",
    owner_token: "tok-winner",
    lease_expires_at: new Date(Date.now() + 30000).toISOString(),
    uv_logo_url: null, laser_logo_url: null,
    credits_charged: null, response_type: null, response_width: null, response_height: null,
    error_message: null,
  });
  setTimeout(() => {
    const row = fake.cache.get("fp-inflight");
    row.status = "succeeded";
    row.uv_logo_url = "data:image/png;base64,WON";
    row.laser_logo_url = "data:image/png;base64,WON2";
  }, 25);

  const outcome = await claimProcessingSlot("fp-inflight", "id-4");
  assert.equal(outcome.kind, "cache_hit");
  assert.equal(outcome.row.uv_logo_url, "data:image/png;base64,WON");
});

test("claimProcessingSlot: a concurrent duplicate propagates the winner's eventual FAILURE rather than retrying itself", async () => {
  reset();
  fake.cache.set("fp-inflight-fail", {
    fingerprint: "fp-inflight-fail", status: "in_progress",
    owner_token: "tok-fail",
    lease_expires_at: new Date(Date.now() + 30000).toISOString(),
    uv_logo_url: null, laser_logo_url: null,
    credits_charged: null, response_type: null, response_width: null, response_height: null,
    error_message: null,
  });
  setTimeout(() => {
    const row = fake.cache.get("fp-inflight-fail");
    row.status = "failed";
    row.error_message = "remove.bg 500";
  }, 25);

  const outcome = await claimProcessingSlot("fp-inflight-fail", "id-5");
  assert.equal(outcome.kind, "failed_upstream");
  assert.equal(outcome.row.error_message, "remove.bg 500");
});

// --- atomic daily / global usage caps ---

test("claimProcessingSlot: refuses once the per-user daily limit is reached, scope='user', and releases the fingerprint claim", async () => {
  reset();
  fake.dailyCounters.set("user:id-heavy", getUserDailyLimit());
  const outcome = await claimProcessingSlot("fp-capped-user", "id-heavy");
  assert.equal(outcome.kind, "over_daily_limit");
  assert.equal(outcome.scope, "user");
  assert.equal(fake.cache.get("fp-capped-user").status, "failed");
});

test("claimProcessingSlot: a DIFFERENT identity is unaffected by another identity's exhausted daily limit", async () => {
  reset();
  fake.dailyCounters.set("user:id-heavy", getUserDailyLimit());
  const outcome = await claimProcessingSlot("fp-other-user", "id-light");
  assert.equal(outcome.kind, "claimed");
});

test("claimProcessingSlot: refuses once the GLOBAL daily limit is reached, scope='global', even for an identity with no usage of its own", async () => {
  reset();
  fake.dailyCounters.set("global:global", getGlobalDailyLimit());
  const outcome = await claimProcessingSlot("fp-capped-global", "id-brand-new");
  assert.equal(outcome.kind, "over_daily_limit");
  assert.equal(outcome.scope, "global");
});

test("the daily quota reservation is all-or-nothing: global counter compensated if user limit fails", async () => {
  reset();
  fake.dailyCounters.set("user:id-at-cap", getUserDailyLimit());
  const globalBefore = fake.dailyCounters.get("global:global") ?? 0;
  const outcome = await claimProcessingSlot("fp-compensate", "id-at-cap");
  assert.equal(outcome.kind, "over_daily_limit");
  assert.equal(outcome.scope, "user");
  assert.equal(fake.dailyCounters.get("global:global") ?? 0, globalBefore);
});

// --- fail-closed when the store is unavailable ---

test("claimProcessingSlot fails closed (kind='unavailable') on fresh insert when store down", async () => {
  reset();
  fake.setUnavailable(true);
  const outcome = await claimProcessingSlot("fp-down", "id-7");
  assert.equal(outcome.kind, "unavailable");
});

test("claimProcessingSlot fails closed if store becomes unavailable mid-poll", async () => {
  reset();
  fake.cache.set("fp-flaky", {
    fingerprint: "fp-flaky", status: "in_progress",
    owner_token: "tok-flaky",
    lease_expires_at: new Date(Date.now() + 30000).toISOString(),
    uv_logo_url: null, laser_logo_url: null,
    credits_charged: null, response_type: null, response_width: null, response_height: null,
    error_message: null,
  });
  setTimeout(() => fake.setUnavailable(true), 5);
  const outcome = await claimProcessingSlot("fp-flaky", "id-8");
  assert.equal(outcome.kind, "unavailable");
});
