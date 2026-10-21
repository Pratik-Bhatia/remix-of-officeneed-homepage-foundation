// Regression tests for processLogoCore (src/lib/image-processing.functions.ts)
// -- the full remove.bg orchestration: validation -> dedup/rate-limit
// safeguards -> the outbound API call -> the PNG recolor step -> the
// response. processLogoServer itself (the createServerFn wrapper) can't
// run under node:test, same as every createServerFn handler in this
// codebase (see enquiries.functions.test.mjs) -- processLogoCore is the
// extracted, request-context-free piece that actually can.
//
// Mocks both the remove.bg HTTP transport (remove-bg-client.server) and
// the raw Supabase I/O (logo-processing-store.server), same mock.module
// convention as b2b-company-setup.functions.test.mjs: each registered
// ONCE at module scope, per-test behavior swapped via mutable references,
// module under test dynamic-imported after both mocks are registered.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/image-processing.functions.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.LOGO_PROCESSING_POLL_INTERVAL_MS = "10";
process.env.LOGO_PROCESSING_POLL_TIMEOUT_MS = "60";
process.env.REMOVE_BG_API_KEY = "test-fake-key-never-real";

function makePngBase64(width, height, seedByte = 0) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; ihdrData[9] = 6;
  ihdrData[12] = seedByte; // bumping this changes the fingerprint without changing declared dimensions
  const type = Buffer.from("IHDR");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13, 0);
  const crc = Buffer.from([0, 0, 0, 0]);
  return Buffer.concat([sig, length, type, ihdrData, crc]).toString("base64");
}

// A tiny real, fully-decodable 1x1 PNG (needed for the success-path tests,
// since finalizeSuccess/the recolor step actually runs `decode()` on
// whatever callRemoveBgApi "returns" as arrayBuffer -- the header-only
// fixtures above are fine for validation tests but not decodable).
// Generated with fast-png's own encode() and round-trip-verified against
// decode() -- not hand-typed, to avoid a subtly-wrong base64 string.
const REAL_1X1_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4XmP4z8DwHwAFAAH/NQZ7kgAAAABJRU5ErkJggg==";

/** Response.arrayBuffer() (what the real callRemoveBgApi awaits) always
 * returns an ArrayBuffer sized to exactly its contents. Buffer.from(...).buffer
 * does NOT have that guarantee -- small Buffers are views into a shared,
 * larger pooled ArrayBuffer (confirmed empirically: an 8192-byte pool
 * slab for a 68-byte buffer), which fast-png's decode() correctly refuses
 * to treat as a standalone PNG. This produces a real, tightly-sized
 * ArrayBuffer so these fixtures behave the way a real fetch response does.
 */
function cleanArrayBufferFromBase64(base64) {
  return Uint8Array.from(Buffer.from(base64, "base64")).buffer;
}

let fakeRemoveBg = async () => { throw new Error("no fake remove.bg configured for this test"); };
mock.module("@/lib/remove-bg-client.server", {
  namedExports: { callRemoveBgApi: (params) => fakeRemoveBg(params) },
});

function makeFakeStore() {
  const cache = new Map();
  const usageRows = [];
  const dailyCounters = new Map(); // `${scope}:${scopeKey}` -> count
  const concurrencySlots = new Map(); // slotId -> { slotId, identityKey, expiresAt }
  let unavailable = false;
  return {
    cache, usageRows, dailyCounters, concurrencySlots,
    setUnavailable(v) { unavailable = v; },
    insertCacheInProgress: async (fingerprint, ownerToken, leaseDurationSeconds = 60) => {
      if (unavailable) return { ok: false, reason: "unavailable", errorMessage: "fake store down" };
      if (cache.has(fingerprint)) return { ok: false, reason: "conflict" };
      cache.set(fingerprint, {
        fingerprint, status: "in_progress",
        owner_token: ownerToken,
        lease_expires_at: new Date(Date.now() + leaseDurationSeconds * 1000).toISOString(),
        uv_logo_url: null, laser_logo_url: null, credits_charged: null,
        response_type: null, response_width: null, response_height: null, error_message: null
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
      if (expiresAt > Date.now()) return { ok: true, reclaimed: false };
      row.owner_token = ownerToken;
      row.lease_expires_at = new Date(Date.now() + leaseDurationSeconds * 1000).toISOString();
      return { ok: true, reclaimed: true };
    },
    extendLease: async (fingerprint, ownerToken, extensionSeconds = 60) => {
      if (unavailable) return { ok: false, reason: "unavailable", errorMessage: "fake store down" };
      const row = cache.get(fingerprint);
      if (!row || row.status !== "in_progress" || row.owner_token !== ownerToken) return { ok: true, extended: false };
      row.lease_expires_at = new Date(Date.now() + extensionSeconds * 1000).toISOString();
      return { ok: true, extended: true };
    },
    updateCacheRowSucceeded: async (fingerprint, ownerToken, fields) => {
      const row = cache.get(fingerprint);
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
      const globalCount = dailyCounters.get("global:global") ?? 0;
      if (globalCount >= globalLimit) return { ok: false, reason: "over_limit", scope: "global" };
      const userCount = dailyCounters.get(`user:${identityKey}`) ?? 0;
      if (userCount >= userLimit) return { ok: false, reason: "over_limit", scope: "user" };
      dailyCounters.set("global:global", globalCount + 1);
      dailyCounters.set(`user:${identityKey}`, userCount + 1);
      return { ok: true };
    },
    reserveConcurrencySlot: async (identityKey, limit, leaseSeconds = 60) => {
      if (unavailable) return { ok: false, reason: "unavailable", errorMessage: "fake store down" };
      const now = Date.now();
      for (const [slotId, slot] of concurrencySlots.entries()) {
        if (slot.identityKey === identityKey && slot.expiresAt <= now) concurrencySlots.delete(slotId);
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
let fakeStore = makeFakeStore();
mock.module("@/lib/logo-processing-store.server", {
  namedExports: {
    insertCacheInProgress: (fp, tok, l) => fakeStore.insertCacheInProgress(fp, tok, l),
    getCacheRow: (fp) => fakeStore.getCacheRow(fp),
    reclaimFailedCacheRow: (fp, tok, l) => fakeStore.reclaimFailedCacheRow(fp, tok, l),
    reclaimStaleCacheRow: (fp, tok, l) => fakeStore.reclaimStaleCacheRow(fp, tok, l),
    extendLease: (fp, tok, ext) => fakeStore.extendLease(fp, tok, ext),
    updateCacheRowSucceeded: (fp, tok, f) => fakeStore.updateCacheRowSucceeded(fp, tok, f),
    updateCacheRowFailed: (fp, tok, e) => fakeStore.updateCacheRowFailed(fp, tok, e),
    reserveDailyQuota: (id, u, g) => fakeStore.reserveDailyQuota(id, u, g),
    reserveConcurrencySlot: (id, l, sec) => fakeStore.reserveConcurrencySlot(id, l, sec),
    releaseConcurrencySlot: (slotId) => fakeStore.releaseConcurrencySlot(slotId),
    insertUsageRow: (e) => fakeStore.insertUsageRow(e),
  },
});

const { processLogoCore } = await import("./image-processing.functions");

let ipCounter = 0;
function freshIp() {
  // Each test gets its own IP so the existing per-IP burst limiter
  // (5/15min, keyed by raw IP) never leaks between unrelated tests.
  ipCounter++;
  return `10.0.0.${ipCounter}`;
}

function reset() {
  fakeStore = makeFakeStore();
}

function successfulRemoveBgMock(overrides = {}) {
  let calls = 0;
  const fn = async () => {
    calls++;
    return {
      ok: true,
      status: 200,
      arrayBuffer: cleanArrayBufferFromBase64(REAL_1X1_PNG_BASE64),
      creditsCharged: "0",
      responseType: "preview",
      responseWidth: "1",
      responseHeight: "1",
      ...overrides,
    };
  };
  fn.getCallCount = () => calls;
  return fn;
}

// --- missing API key: fails safe, never claims a slot or touches remove.bg ---

test("missing REMOVE_BG_API_KEY: fails safe without claiming a cache slot or calling remove.bg", async () => {
  reset();
  const savedKey = process.env.REMOVE_BG_API_KEY;
  delete process.env.REMOVE_BG_API_KEY;
  let called = false;
  fakeRemoveBg = async () => { called = true; throw new Error("must not be called"); };
  try {
    const result = await processLogoCore({ imageBase64: makePngBase64(10, 10) }, freshIp());
    assert.equal(result.success, false);
    assert.match(result.error, /not configured/);
    assert.equal(called, false);
    assert.equal(fakeStore.cache.size, 0);
  } finally {
    process.env.REMOVE_BG_API_KEY = savedKey;
  }
});

// --- validation rejection: remove.bg is never reached ---

test("an invalid image (random bytes) is rejected before remove.bg is ever called", async () => {
  reset();
  let called = false;
  fakeRemoveBg = async () => { called = true; throw new Error("must not be called"); };
  const junkBase64 = Buffer.from([1, 2, 3, 4, 5]).toString("base64");
  const result = await processLogoCore({ imageBase64: junkBase64 }, freshIp());
  assert.equal(result.success, false);
  assert.equal(called, false);
  assert.equal(fakeStore.usageRows.at(-1).outcome, "validation_rejected");
  assert.equal(fakeStore.usageRows.at(-1).was_outbound_call, false);
});

test("an oversized image (dimensions over the limit) is rejected before remove.bg is ever called", async () => {
  reset();
  let called = false;
  fakeRemoveBg = async () => { called = true; throw new Error("must not be called"); };
  const result = await processLogoCore({ imageBase64: makePngBase64(5000, 5000) }, freshIp());
  assert.equal(result.success, false);
  assert.equal(called, false);
});

// --- successful full flow ---

test("a fresh, valid upload is claimed, calls remove.bg exactly once, and returns both logo URLs", async () => {
  reset();
  const mockFn = successfulRemoveBgMock();
  fakeRemoveBg = mockFn;
  const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
  assert.equal(result.success, true);
  assert.ok(result.uvLogoUrl.startsWith("data:image/png;base64,"));
  assert.ok(result.laserLogoUrl.startsWith("data:image/png;base64,"));
  assert.equal(mockFn.getCallCount(), 1);
});

test("a successful call finalizes the cache row as succeeded and logs the usage row with outbound=true and the real credits_charged", async () => {
  reset();
  fakeRemoveBg = successfulRemoveBgMock({ creditsCharged: "0", responseType: "preview" });
  await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
  const row = [...fakeStore.cache.values()][0];
  assert.equal(row.status, "succeeded");
  const usage = fakeStore.usageRows.at(-1);
  assert.equal(usage.outcome, "api_call_succeeded");
  assert.equal(usage.was_outbound_call, true);
  assert.equal(usage.credits_charged, "0");
  assert.equal(usage.response_type, "preview");
});

// --- API failure: not cached as success, slot released ---

test("a remove.bg API failure returns an error, marks the cache row failed (never succeeded), and releases the concurrency slot", async () => {
  reset();
  fakeRemoveBg = async () => ({ ok: false, status: 500, errorText: "upstream error", creditsCharged: null, responseType: null, responseWidth: null, responseHeight: null });
  const ip = freshIp();
  const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, ip);
  assert.equal(result.success, false);
  const row = [...fakeStore.cache.values()][0];
  assert.equal(row.status, "failed");
  assert.notEqual(row.status, "succeeded");
  // the slot was released -- a second, different upload from the same
  // identity should not be blocked by the concurrency cap
  fakeRemoveBg = successfulRemoveBgMock();
  const secondResult = await processLogoCore({ imageBase64: makePngBase64(20, 20) }, ip);
  assert.notEqual(secondResult.error, "You already have a logo being processed. Please wait for it to finish.");
});

// --- duplicate sequential request: cache hit, no second remove.bg call ---

test("uploading the IDENTICAL file twice sequentially only calls remove.bg once -- the second call is a cache hit", async () => {
  reset();
  const mockFn = successfulRemoveBgMock();
  fakeRemoveBg = mockFn;
  const first = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
  const second = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp()); // different identity, same bytes
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(second.uvLogoUrl, first.uvLogoUrl);
  assert.equal(mockFn.getCallCount(), 1, "remove.bg must only be called once for the identical file");
});

test("uploading a DIFFERENT file calls remove.bg again (not a false cache hit)", async () => {
  reset();
  const mockFn = successfulRemoveBgMock();
  fakeRemoveBg = mockFn;
  await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
  await processLogoCore({ imageBase64: makePngBase64(50, 50) }, freshIp());
  assert.equal(mockFn.getCallCount(), 2);
});

// --- duplicate concurrent requests: only one outbound call ---

test("two concurrent requests for the IDENTICAL file result in exactly one outbound remove.bg call", async () => {
  reset();
  let callCount = 0;
  fakeRemoveBg = async () => {
    callCount++;
    await new Promise((r) => setTimeout(r, 30)); // hold the "winner" slot open while the loser polls
    return { ok: true, status: 200, arrayBuffer: cleanArrayBufferFromBase64(REAL_1X1_PNG_BASE64), creditsCharged: "0", responseType: "preview", responseWidth: "1", responseHeight: "1" };
  };
  const [a, b] = await Promise.all([
    processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp()),
    processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp()),
  ]);
  assert.equal(a.success, true);
  assert.equal(b.success, true);
  assert.equal(callCount, 1, "only the winner should have actually called remove.bg");
});

// --- per-identity concurrency cap ---

test("a 4th concurrent upload from the SAME identity (over the default limit of 3) is refused without calling remove.bg", async () => {
  reset();
  let callCount = 0;
  fakeRemoveBg = async () => {
    callCount++;
    await new Promise((r) => setTimeout(r, 30));
    return { ok: true, status: 200, arrayBuffer: cleanArrayBufferFromBase64(REAL_1X1_PNG_BASE64), creditsCharged: "0", responseType: "preview", responseWidth: "1", responseHeight: "1" };
  };
  const ip = freshIp();
  const results = await Promise.all([
    processLogoCore({ imageBase64: makePngBase64(1, 1, 1) }, ip),
    processLogoCore({ imageBase64: makePngBase64(1, 1, 2) }, ip),
    processLogoCore({ imageBase64: makePngBase64(1, 1, 3) }, ip),
    processLogoCore({ imageBase64: makePngBase64(1, 1, 4) }, ip),
  ]);
  const refused = results.filter((r) => !r.success && r.error.includes("already have a logo being processed"));
  assert.equal(refused.length, 1, "exactly the 4th request should be refused by the concurrency cap");
  assert.equal(callCount, 3);
});

// --- existing per-IP burst limiter still applies ---

test("the existing per-IP burst limiter (5 per window) still rejects a 6th rapid request before validation/remove.bg", async () => {
  reset();
  let callCount = 0;
  fakeRemoveBg = async () => { callCount++; return { ok: true, status: 200, arrayBuffer: cleanArrayBufferFromBase64(REAL_1X1_PNG_BASE64), creditsCharged: "0", responseType: "preview", responseWidth: "1", responseHeight: "1" }; };
  const ip = freshIp();
  const results = [];
  for (let i = 0; i < 6; i++) {
    results.push(await processLogoCore({ imageBase64: makePngBase64(1, 1, i) }, ip));
  }
  assert.equal(results[5].success, false);
  assert.match(results[5].error, /Too many requests/);
});

// --- secrets never leak ---

test("the API key is never present anywhere in the response or in the logged usage row", async () => {
  reset();
  fakeRemoveBg = successfulRemoveBgMock();
  const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
  const serializedResult = JSON.stringify(result);
  assert.ok(!serializedResult.includes(process.env.REMOVE_BG_API_KEY));
  const usage = fakeStore.usageRows.at(-1);
  assert.ok(!JSON.stringify(usage).includes(process.env.REMOVE_BG_API_KEY));
});

// --- fail closed when the safeguard store is unavailable (requirement 2) ---

test("when the dedup/quota store is unavailable, the request is rejected and remove.bg is NEVER called -- it does not silently bypass the safeguard", async () => {
  reset();
  fakeStore.setUnavailable(true);
  let called = false;
  fakeRemoveBg = async () => { called = true; throw new Error("must not be called"); };
  const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
  assert.equal(result.success, false);
  assert.match(result.error, /temporarily unavailable/i);
  assert.equal(called, false);
});

test("when the concurrency store (not just the daily-quota store) is unavailable, the request is still rejected before remove.bg is called", async () => {
  reset();
  let called = false;
  fakeRemoveBg = async () => { called = true; throw new Error("must not be called"); };
  const originalReserve = fakeStore.reserveConcurrencySlot;
  fakeStore.reserveConcurrencySlot = async (id, limit) => {
    void originalReserve;
    return { ok: false, reason: "unavailable", errorMessage: "forced down for this test" };
  };
  const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
  assert.equal(result.success, false);
  assert.match(result.error, /temporarily unavailable/i);
  assert.equal(called, false);
});

test("once Supabase recovers, a request that was previously rejected as unavailable succeeds normally again", async () => {
  reset();
  fakeStore.setUnavailable(true);
  const ip = freshIp();
  const down = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, ip);
  assert.equal(down.success, false);

  fakeStore.setUnavailable(false);
  fakeRemoveBg = successfulRemoveBgMock();
  const recovered = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, ip);
  assert.equal(recovered.success, true);
});

// --- concurrency recovery: a finished request frees its slot for a new one ---

test("concurrency recovery: after the 3 in-flight requests finish, a 4th (now sequential) request from the same identity succeeds instead of being refused", async () => {
  reset();
  let callCount = 0;
  fakeRemoveBg = async () => {
    callCount++;
    return { ok: true, status: 200, arrayBuffer: cleanArrayBufferFromBase64(REAL_1X1_PNG_BASE64), creditsCharged: "0", responseType: "preview", responseWidth: "1", responseHeight: "1" };
  };
  const ip = freshIp();
  const first = await processLogoCore({ imageBase64: makePngBase64(1, 1, 101) }, ip);
  const second = await processLogoCore({ imageBase64: makePngBase64(1, 1, 102) }, ip);
  const third = await processLogoCore({ imageBase64: makePngBase64(1, 1, 103) }, ip);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(third.success, true);
  // all 3 slots were released after finishing -- a 4th should NOT be
  // refused by the concurrency cap now that none are still in flight
  const fourth = await processLogoCore({ imageBase64: makePngBase64(1, 1, 104) }, ip);
  assert.equal(fourth.success, true);
  assert.equal(callCount, 4);
});

// --- stale in-progress cache recovery ---

test("stale in-progress recovery: an upload whose earlier processing worker crashed and lease expired is recovered and processed", async () => {
  reset();
  const mockFn = successfulRemoveBgMock();
  fakeRemoveBg = mockFn;

  // Simulate a crashed worker: left an in-progress row with lease expired 10s ago
  const imageBase64 = makePngBase64(10, 10, 88);
  const { computeFingerprint } = await import("./logo-processing-safeguards.server");
  const bytes = Uint8Array.from(Buffer.from(imageBase64, "base64"));
  const fingerprint = computeFingerprint(bytes, "small");

  fakeStore.cache.set(fingerprint, {
    fingerprint,
    status: "in_progress",
    owner_token: "crashed-worker-token",
    lease_expires_at: new Date(Date.now() - 10000).toISOString(),
    uv_logo_url: null, laser_logo_url: null,
    credits_charged: null, response_type: null, response_width: null, response_height: null,
    error_message: null,
  });

  const result = await processLogoCore({ imageBase64 }, freshIp());
  assert.equal(result.success, true);
  assert.equal(mockFn.getCallCount(), 1);
  const row = fakeStore.cache.get(fingerprint);
  assert.equal(row.status, "succeeded");
});

// --- abandoned concurrency lease recovery ---

test("abandoned concurrency lease: expired slots from crashed workers are purged so identity is never locked out", async () => {
  reset();
  const mockFn = successfulRemoveBgMock();
  fakeRemoveBg = mockFn;
  const ip = freshIp();
  const { hashIdentityKey, getUserConcurrentLimit } = await import("./logo-processing-safeguards.server");
  const idKey = hashIdentityKey(ip);

  // Artificially saturate all concurrency slots with expired leases
  const limit = getUserConcurrentLimit();
  for (let i = 0; i < limit; i++) {
    fakeStore.concurrencySlots.set(`dead-worker-${i}`, {
      slotId: `dead-worker-${i}`,
      identityKey: idKey,
      expiresAt: Date.now() - 5000, // expired!
    });
  }

  // The request should automatically purge expired slots and succeed
  const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, ip);
  assert.equal(result.success, true);
});
