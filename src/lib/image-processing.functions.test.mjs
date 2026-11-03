// Regression tests for processLogoCore (src/lib/logo-processing-core.server.ts)
// -- the full background-removal orchestration: validation -> dedup/rate-
// limit safeguards -> the outbound provider call (+ at most one fallback)
// -> the PNG normalise/recolor step -> the response. processLogoServer itself (the createServerFn wrapper) can't
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
// The original suite below exercises the pipeline with remove.bg as the
// sole provider (BG_REMOVAL_PROVIDER=removebg, no fallback) -- exactly the
// pre-API4AI behaviour. The API4AI-primary + fallback tests at the end of
// this file override these per test via withEnv().
process.env.BG_REMOVAL_PROVIDER = "removebg";
process.env.BG_REMOVAL_FALLBACK_PROVIDER = "none";
delete process.env.API4AI_API_KEY;

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

// API4AI transport mocked the same way, so no test can ever reach the real
// (paid) API. The real module's constants are re-exported unchanged.
let fakeApi4ai = async () => { throw new Error("no fake API4AI configured for this test"); };
mock.module("@/lib/api4ai-client.server", {
  namedExports: {
    callApi4aiApi: (params) => fakeApi4ai(params),
    API4AI_ENDPOINT: "https://api4ai.cloud/img-bg-removal/v1/results",
    API4AI_MODE: "fg-image",
    API4AI_KIND: "general",
    API4AI_MAX_RESPONSE_BYTES: 40 * 1024 * 1024,
  },
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

const { processLogoCore } = await import("./logo-processing-core.server");

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
  // A client-style variable must never be used as a fallback.
  process.env.VITE_REMOVE_BG_API_KEY = "test-fake-client-key";
  const logged = [];
  const savedError = console.error;
  console.error = (...args) => logged.push(args.join(" "));
  try {
    const result = await processLogoCore({ imageBase64: makePngBase64(10, 10) }, freshIp());
    assert.equal(result.success, false);
    assert.match(result.error, /not configured/);
    assert.equal(called, false);
    assert.equal(fakeStore.cache.size, 0);
    assert.ok(logged.some((line) => line.includes("REMOVE_BG_API_KEY is not set")));
  } finally {
    console.error = savedError;
    delete process.env.VITE_REMOVE_BG_API_KEY;
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

// ===========================================================================
// API4AI as primary provider (the new default) + single remove.bg fallback
// ===========================================================================

const { encode: encodePng, decode: decodePng } = await import("fast-png");
const { computeFingerprint: fingerprintOf } = await import("./logo-processing-safeguards.server");
const { getProvider } = await import("./background-removal-providers.server");

const FAKE_API4AI_KEY = "test-fake-api4ai-key-never-real";

/** Runs fn with the given env vars set (undefined = deleted), then restores. */
async function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

/** Default production-like config: API4AI primary, remove.bg fallback. */
const API4AI_DEFAULTS = {
  BG_REMOVAL_PROVIDER: undefined,
  BG_REMOVAL_FALLBACK_PROVIDER: undefined,
  API4AI_API_KEY: FAKE_API4AI_KEY,
  REMOVE_BG_API_KEY: "test-fake-key-never-real",
};

function rgbaPng(width, height, pixel = () => [20, 40, 110, 255]) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data.set(pixel(x, y), (y * width + x) * 4);
  }
  return Uint8Array.from(encodePng({ width, height, data, channels: 4, depth: 8 }));
}

function api4aiSuccess(pngBytes, overrides = {}) {
  let calls = 0;
  const seen = [];
  const fn = async (params) => {
    calls++;
    seen.push(params);
    return {
      ok: true, status: 200,
      arrayBuffer: pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength),
      creditsCharged: null, responseType: "api4ai", responseWidth: "1", responseHeight: "1",
      ...overrides,
    };
  };
  fn.getCallCount = () => calls;
  fn.seen = seen;
  return fn;
}

function api4aiFailure(status = 500, errorText = "upstream error body") {
  let calls = 0;
  const fn = async () => {
    calls++;
    return { ok: false, status, errorText, creditsCharged: null, responseType: null, responseWidth: null, responseHeight: null };
  };
  fn.getCallCount = () => calls;
  return fn;
}

function inputBytes(base64) {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function seedCacheRow(fingerprint, uv, laser) {
  fakeStore.cache.set(fingerprint, {
    fingerprint, status: "succeeded", owner_token: null, lease_expires_at: null,
    uv_logo_url: uv, laser_logo_url: laser,
    credits_charged: "0", response_type: "preview", response_width: "1", response_height: "1", error_message: null,
  });
}

const api4aiFingerprint = (b64) => fingerprintOf(inputBytes(b64), getProvider("api4ai").cacheVariant);
const removeBgFingerprint = (b64) => fingerprintOf(inputBytes(b64), "small");

test("api4ai default: API4AI is called once, remove.bg never, and the result is cached under the API4AI-specific fingerprint", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    const api = api4aiSuccess(rgbaPng(4, 2));
    fakeApi4ai = api;
    let removeBgCalls = 0;
    fakeRemoveBg = async () => { removeBgCalls++; throw new Error("must not be called"); };
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, true);
    assert.equal(api.getCallCount(), 1);
    assert.equal(removeBgCalls, 0);
    assert.equal(api.seen[0].apiKey, FAKE_API4AI_KEY);
    assert.equal(api.seen[0].mimeType, "image/png");
    assert.deepEqual([...api.seen[0].imageBytes], [...inputBytes(REAL_1X1_PNG_BASE64)]);
    assert.notEqual(api4aiFingerprint(REAL_1X1_PNG_BASE64), removeBgFingerprint(REAL_1X1_PNG_BASE64));
    assert.equal(fakeStore.cache.get(api4aiFingerprint(REAL_1X1_PNG_BASE64))?.status, "succeeded");
    assert.equal(fakeStore.cache.has(removeBgFingerprint(REAL_1X1_PNG_BASE64)), false);
    assert.equal(fakeStore.usageRows.at(-1).outcome, "api_call_succeeded");
    assert.equal(fakeStore.usageRows.at(-1).response_type, "api4ai");
  });
});

test("api4ai: a full-size output is downscaled to a 768px longest side with alpha preserved, and the laser image matches it", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    // 1600x800: left half opaque navy, right half fully transparent
    fakeApi4ai = api4aiSuccess(rgbaPng(1600, 800, (x) => (x < 800 ? [20, 40, 110, 255] : [0, 0, 0, 0])));
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, true);
    const uv = decodePng(Buffer.from(result.uvLogoUrl.split(",")[1], "base64"));
    const laser = decodePng(Buffer.from(result.laserLogoUrl.split(",")[1], "base64"));
    assert.equal(uv.width, 768); assert.equal(uv.height, 384);
    assert.equal(uv.channels, 4); assert.equal(uv.depth, 8);
    assert.equal(laser.width, 768); assert.equal(laser.height, 384);
    const at = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
    assert.deepEqual(at(uv, 10, 10), [20, 40, 110, 255]);
    assert.equal(at(uv, 700, 10)[3], 0, "transparent region stays transparent");
    const [lr, lg, lb, la] = at(laser, 10, 10);
    assert.ok(lr === lg && lg === lb && lr >= 160 && lr <= 220 && la === 255, "laser pixel is the silver recolour");
    assert.equal(at(laser, 700, 10)[3], 0);
  });
});

test("api4ai: an existing cached remove.bg result is NOT served to an API4AI request, and stays untouched", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    seedCacheRow(removeBgFingerprint(REAL_1X1_PNG_BASE64), "data:image/png;base64,OLD-REMOVEBG-UV", "data:image/png;base64,OLD-REMOVEBG-LASER");
    const api = api4aiSuccess(rgbaPng(2, 2));
    fakeApi4ai = api;
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, true);
    assert.equal(api.getCallCount(), 1);
    assert.notEqual(result.uvLogoUrl, "data:image/png;base64,OLD-REMOVEBG-UV");
    assert.equal(fakeStore.cache.get(removeBgFingerprint(REAL_1X1_PNG_BASE64)).uv_logo_url, "data:image/png;base64,OLD-REMOVEBG-UV");
  });
});

test("rollback: with BG_REMOVAL_PROVIDER=removebg, existing cached remove.bg results are served with no API call at all", async () => {
  reset();
  await withEnv({ ...API4AI_DEFAULTS, BG_REMOVAL_PROVIDER: "removebg" }, async () => {
    seedCacheRow(removeBgFingerprint(REAL_1X1_PNG_BASE64), "data:image/png;base64,OLD-REMOVEBG-UV", "data:image/png;base64,OLD-REMOVEBG-LASER");
    let calls = 0;
    fakeApi4ai = async () => { calls++; throw new Error("must not be called"); };
    fakeRemoveBg = async () => { calls++; throw new Error("must not be called"); };
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, true);
    assert.equal(result.uvLogoUrl, "data:image/png;base64,OLD-REMOVEBG-UV");
    assert.equal(calls, 0);
  });
});

test("fallback: an API4AI failure triggers exactly ONE remove.bg call; the result is cached under remove.bg's fingerprint, never API4AI's", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    const api = api4aiFailure(503);
    fakeApi4ai = api;
    const removeBg = successfulRemoveBgMock();
    fakeRemoveBg = removeBg;
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, true);
    assert.equal(api.getCallCount(), 1);
    assert.equal(removeBg.getCallCount(), 1);
    const primaryRow = fakeStore.cache.get(api4aiFingerprint(REAL_1X1_PNG_BASE64));
    assert.equal(primaryRow.status, "failed", "primary row is never marked succeeded with a fallback result");
    assert.match(primaryRow.error_message, /served by remove\.bg fallback/);
    assert.equal(fakeStore.cache.get(removeBgFingerprint(REAL_1X1_PNG_BASE64)).status, "succeeded");
    const outcomes = fakeStore.usageRows.map((r) => [r.outcome, r.was_outbound_call]);
    assert.deepEqual(outcomes.slice(-2), [["api_call_failed", true], ["api_call_succeeded", true]]);
    assert.equal(fakeStore.dailyCounters.get("global:global"), 1, "one upload = one daily-quota reservation, even with the fallback");
  });
});

test("fallback: when remove.bg already has this image cached, an API4AI failure reuses it with no paid fallback call", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    seedCacheRow(removeBgFingerprint(REAL_1X1_PNG_BASE64), "data:image/png;base64,CACHED-UV", "data:image/png;base64,CACHED-LASER");
    fakeApi4ai = api4aiFailure(500);
    let removeBgCalls = 0;
    fakeRemoveBg = async () => { removeBgCalls++; throw new Error("must not be called"); };
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, true);
    assert.equal(result.uvLogoUrl, "data:image/png;base64,CACHED-UV");
    assert.equal(removeBgCalls, 0);
    assert.equal(fakeStore.usageRows.at(-1).outcome, "cache_hit");
  });
});

test("fallback: when both providers fail there is no retry loop (one call each) and no upstream error text reaches the browser", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    const api = api4aiFailure(500, "API4AI-INTERNAL-DETAIL");
    fakeApi4ai = api;
    let removeBgCalls = 0;
    fakeRemoveBg = async () => { removeBgCalls++; return { ok: false, status: 402, errorText: "REMOVEBG-INTERNAL-DETAIL", creditsCharged: null, responseType: null, responseWidth: null, responseHeight: null }; };
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, false);
    assert.equal(api.getCallCount(), 1);
    assert.equal(removeBgCalls, 1);
    assert.doesNotMatch(result.error, /INTERNAL-DETAIL|500|402/);
    assert.match(result.error, /couldn.t process this logo/);
    const primaryRow = fakeStore.cache.get(api4aiFingerprint(REAL_1X1_PNG_BASE64));
    assert.equal(primaryRow.status, "failed");
    assert.match(primaryRow.error_message, /API4AI-INTERNAL-DETAIL.*REMOVEBG-INTERNAL-DETAIL/, "details kept server-side");
  });
});

test("fallback: the cache lease is extended before the fallback call", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    fakeApi4ai = api4aiFailure(500);
    let extendCalls = 0;
    const originalExtend = fakeStore.extendLease;
    fakeStore.extendLease = async (...args) => { extendCalls++; return originalExtend(...args); };
    let extendedBeforeFallback = false;
    const removeBg = successfulRemoveBgMock();
    fakeRemoveBg = async (params) => { extendedBeforeFallback = extendCalls === 1; return removeBg(params); };
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, true);
    assert.equal(extendedBeforeFallback, true);
  });
});

test("fallback disabled (BG_REMOVAL_FALLBACK_PROVIDER=none): an API4AI failure returns an error without calling remove.bg", async () => {
  reset();
  await withEnv({ ...API4AI_DEFAULTS, BG_REMOVAL_FALLBACK_PROVIDER: "none" }, async () => {
    fakeApi4ai = api4aiFailure(500);
    let removeBgCalls = 0;
    fakeRemoveBg = async () => { removeBgCalls++; throw new Error("must not be called"); };
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, false);
    assert.equal(removeBgCalls, 0);
  });
});

test("an API4AI output without transparency (RGB PNG) is rejected as invalid and the fallback is used", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    const rgb = Uint8Array.from(encodePng({ width: 2, height: 2, data: new Uint8Array(12).fill(200), channels: 3, depth: 8 }));
    fakeApi4ai = api4aiSuccess(rgb);
    const removeBg = successfulRemoveBgMock();
    fakeRemoveBg = removeBg;
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, true);
    assert.equal(removeBg.getCallCount(), 1);
    assert.match(fakeStore.cache.get(api4aiFingerprint(REAL_1X1_PNG_BASE64)).error_message, /no alpha channel/);
  });
});

test("an API4AI malformed PNG output is rejected and the fallback is used", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    const broken = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
    fakeApi4ai = api4aiSuccess(broken);
    const removeBg = successfulRemoveBgMock();
    fakeRemoveBg = removeBg;
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, true);
    assert.equal(removeBg.getCallCount(), 1);
    assert.match(fakeStore.cache.get(api4aiFingerprint(REAL_1X1_PNG_BASE64)).error_message, /output rejected/);
  });
});

test("an API4AI thrown transport error is contained and falls back once", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    fakeApi4ai = async () => { throw new Error("socket hang up"); };
    const removeBg = successfulRemoveBgMock();
    fakeRemoveBg = removeBg;
    const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(result.success, true);
    assert.equal(removeBg.getCallCount(), 1);
  });
});

test("missing API4AI_API_KEY with REMOVE_BG_API_KEY set: remove.bg is used as primary (old cache variant); a VITE_ copy of the key is ignored", async () => {
  reset();
  await withEnv({ ...API4AI_DEFAULTS, API4AI_API_KEY: undefined, VITE_API4AI_API_KEY: "test-fake-client-key" }, async () => {
    let api4aiCalls = 0;
    fakeApi4ai = async () => { api4aiCalls++; throw new Error("must not be called"); };
    fakeRemoveBg = successfulRemoveBgMock();
    const logged = [];
    const savedError = console.error;
    console.error = (...args) => logged.push(args.join(" "));
    try {
      const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
      assert.equal(result.success, true);
      assert.equal(api4aiCalls, 0);
      assert.ok(logged.some((l) => l.includes("API4AI_API_KEY is not set")));
      assert.equal(fakeStore.cache.get(removeBgFingerprint(REAL_1X1_PNG_BASE64)).status, "succeeded");
    } finally {
      console.error = savedError;
    }
  });
});

test("missing BOTH provider keys: fails safe as 'not configured' without claiming a cache slot or calling anything", async () => {
  reset();
  await withEnv({ ...API4AI_DEFAULTS, API4AI_API_KEY: undefined, REMOVE_BG_API_KEY: undefined }, async () => {
    let calls = 0;
    fakeApi4ai = async () => { calls++; throw new Error("must not be called"); };
    fakeRemoveBg = async () => { calls++; throw new Error("must not be called"); };
    const savedError = console.error;
    console.error = () => {};
    try {
      const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
      assert.equal(result.success, false);
      assert.match(result.error, /not configured/);
      assert.equal(calls, 0);
      assert.equal(fakeStore.cache.size, 0);
    } finally {
      console.error = savedError;
    }
  });
});

test("api4ai: identical sequential uploads hit the cache (one API4AI call total)", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    const api = api4aiSuccess(rgbaPng(2, 2));
    fakeApi4ai = api;
    const a = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    const b = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
    assert.equal(a.success, true); assert.equal(b.success, true);
    assert.equal(b.uvLogoUrl, a.uvLogoUrl);
    assert.equal(api.getCallCount(), 1);
    assert.equal(fakeStore.usageRows.at(-1).outcome, "cache_hit");
  });
});

test("api4ai: the per-identity concurrency cap (3) and the per-identity daily cap still apply", async () => {
  reset();
  await withEnv({ ...API4AI_DEFAULTS, LOGO_PROCESSING_USER_DAILY_LIMIT: "3" }, async () => {
    let calls = 0;
    fakeApi4ai = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      const png = rgbaPng(2, 2);
      return { ok: true, status: 200, arrayBuffer: png.buffer.slice(0), creditsCharged: null, responseType: "api4ai", responseWidth: "2", responseHeight: "2" };
    };
    const ip = freshIp();
    const results = await Promise.all([1, 2, 3, 4].map((i) => processLogoCore({ imageBase64: makePngBase64(1, 1, 200 + i) }, ip)));
    assert.equal(results.filter((r) => !r.success && r.error.includes("already have a logo being processed")).length, 1);
    assert.equal(calls, 3);
    const fourth = await processLogoCore({ imageBase64: makePngBase64(1, 1, 250) }, ip);
    assert.equal(fourth.success, false);
    assert.match(fourth.error, /today's logo-processing limit/);
    assert.equal(calls, 3);
  });
});

test("api4ai: neither provider key appears in the response, usage rows, cache rows or server log lines; the log names each provider", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    fakeApi4ai = api4aiFailure(500);
    fakeRemoveBg = successfulRemoveBgMock();
    const lines = [];
    const saved = { log: console.log, warn: console.warn, error: console.error };
    console.log = console.warn = console.error = (...args) => lines.push(args.join(" "));
    try {
      const result = await processLogoCore({ imageBase64: REAL_1X1_PNG_BASE64 }, freshIp());
      const haystack = JSON.stringify(result) + JSON.stringify(fakeStore.usageRows) + JSON.stringify([...fakeStore.cache.values()]) + lines.join("\n");
      assert.ok(!haystack.includes(FAKE_API4AI_KEY));
      assert.ok(!haystack.includes("test-fake-key-never-real"));
      assert.ok(lines.some((l) => l.includes("provider=api4ai outcome=api_call_failed")));
      assert.ok(lines.some((l) => l.includes("provider=removebg outcome=api_call_succeeded")));
    } finally {
      Object.assign(console, saved);
    }
  });
});

// ===========================================================================
// Local plain-background path (no provider call) inside the full pipeline
// ===========================================================================

const { LOCAL_CACHE_VARIANT } = await import("./local-background-removal.server");

/** Black disc on a plain white background, as an RGB PNG (base64). */
function plainBackgroundLogoBase64(seed = 0) {
  const w = 240, h = 160, data = new Uint8Array(w * h * 3).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (Math.hypot(x - 120, y - 80) < 50 + seed) data.set([12, 12, 12], (y * w + x) * 3);
  }
  return Buffer.from(encodePng({ width: w, height: h, data, channels: 3, depth: 8 })).toString("base64");
}

/** Smooth gradient over the whole image: not a plain background. */
function complexImageBase64() {
  const w = 200, h = 120, data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([x, y * 2, 128], (y * w + x) * 3);
  return Buffer.from(encodePng({ width: w, height: h, data, channels: 3, depth: 8 })).toString("base64");
}

test("local: a plain-background logo is processed WITHOUT any provider call, with transparent background and opaque logo", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    let calls = 0;
    fakeApi4ai = async () => { calls++; throw new Error("must not be called"); };
    fakeRemoveBg = async () => { calls++; throw new Error("must not be called"); };
    const b64 = plainBackgroundLogoBase64();
    const result = await processLogoCore({ imageBase64: b64 }, freshIp());
    assert.equal(result.success, true);
    assert.equal(calls, 0);
    const uv = decodePng(Buffer.from(result.uvLogoUrl.split(",")[1], "base64"));
    const laser = decodePng(Buffer.from(result.laserLogoUrl.split(",")[1], "base64"));
    const at = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
    assert.equal(at(uv, 3, 3)[3], 0, "UV background transparent");
    assert.deepEqual(at(uv, 120, 80), [12, 12, 12, 255], "UV logo opaque, original colour");
    assert.equal(at(laser, 3, 3)[3], 0, "laser background transparent (not grey)");
    const [lr, lg, lb, la] = at(laser, 120, 80);
    assert.ok(lr === lg && lg === lb && la === 255);
    const usage = fakeStore.usageRows.at(-1);
    assert.equal(usage.outcome, "api_call_succeeded");
    assert.equal(usage.was_outbound_call, false);
    assert.equal(usage.response_type, "local");
    const fp = fingerprintOf(inputBytes(b64), LOCAL_CACHE_VARIANT);
    assert.equal(fakeStore.cache.get(fp)?.status, "succeeded");
    assert.equal(fakeStore.cache.has(api4aiFingerprint(b64)), false, "never stored as an API4AI result");
  });
});

test("local: still counts against the daily quota and still respects the per-identity daily limit", async () => {
  reset();
  await withEnv({ ...API4AI_DEFAULTS, LOGO_PROCESSING_USER_DAILY_LIMIT: "1" }, async () => {
    fakeApi4ai = async () => { throw new Error("must not be called"); };
    const ip = freshIp();
    const first = await processLogoCore({ imageBase64: plainBackgroundLogoBase64(0) }, ip);
    assert.equal(first.success, true);
    assert.equal(fakeStore.dailyCounters.get("global:global"), 1);
    const second = await processLogoCore({ imageBase64: plainBackgroundLogoBase64(5) }, ip);
    assert.equal(second.success, false);
    assert.match(second.error, /today's logo-processing limit/);
  });
});

test("local: the per-identity concurrency cap still applies to local processing", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    fakeApi4ai = async () => { throw new Error("must not be called"); };
    const ip = freshIp();
    const originalClaimInsert = fakeStore.insertCacheInProgress;
    fakeStore.insertCacheInProgress = async (...args) => { await new Promise((r) => setTimeout(r, 30)); return originalClaimInsert(...args); };
    const results = await Promise.all([0, 3, 6, 9].map((s) => processLogoCore({ imageBase64: plainBackgroundLogoBase64(s) }, ip)));
    assert.equal(results.filter((r) => !r.success && r.error.includes("already have a logo being processed")).length, 1);
  });
});

test("local: an identical re-upload is a cache hit", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    fakeApi4ai = async () => { throw new Error("must not be called"); };
    const b64 = plainBackgroundLogoBase64();
    const a = await processLogoCore({ imageBase64: b64 }, freshIp());
    const b = await processLogoCore({ imageBase64: b64 }, freshIp());
    assert.equal(b.uvLogoUrl, a.uvLogoUrl);
    assert.equal(fakeStore.usageRows.at(-1).outcome, "cache_hit");
  });
});

test("local: an already-transparent PNG is used as-is without a provider call", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    let calls = 0;
    fakeApi4ai = async () => { calls++; throw new Error("must not be called"); };
    const png = rgbaPng(100, 60, (x, y) => (x > 20 && x < 80 && y > 15 && y < 45 ? [200, 30, 40, 255] : [0, 0, 0, 0]));
    const result = await processLogoCore({ imageBase64: Buffer.from(png).toString("base64") }, freshIp());
    assert.equal(result.success, true);
    assert.equal(calls, 0);
    const uv = decodePng(Buffer.from(result.uvLogoUrl.split(",")[1], "base64"));
    assert.deepEqual([...uv.data.slice((30 * 100 + 50) * 4, (30 * 100 + 50) * 4 + 4)], [200, 30, 40, 255]);
    assert.equal(uv.data[3], 0);
  });
});

test("complex image (gradient/photo): local is not used and API4AI is called exactly once", async () => {
  reset();
  await withEnv(API4AI_DEFAULTS, async () => {
    const api = api4aiSuccess(rgbaPng(4, 4));
    fakeApi4ai = api;
    const b64 = complexImageBase64();
    const result = await processLogoCore({ imageBase64: b64 }, freshIp());
    assert.equal(result.success, true);
    assert.equal(api.getCallCount(), 1);
    assert.equal(fakeStore.cache.get(api4aiFingerprint(b64))?.status, "succeeded");
    assert.equal(fakeStore.usageRows.at(-1).response_type, "api4ai");
  });
});

test("complex image + API4AI failure + BG_REMOVAL_FALLBACK_PROVIDER=none: generic error, remove.bg never called", async () => {
  reset();
  await withEnv({ ...API4AI_DEFAULTS, BG_REMOVAL_FALLBACK_PROVIDER: "none" }, async () => {
    fakeApi4ai = api4aiFailure(500, "API4AI-DETAIL");
    let removeBgCalls = 0;
    fakeRemoveBg = async () => { removeBgCalls++; throw new Error("must not be called"); };
    const result = await processLogoCore({ imageBase64: complexImageBase64() }, freshIp());
    assert.equal(result.success, false);
    assert.equal(result.error, "We couldn't process this logo. Please try again or upload a different image.");
    assert.equal(removeBgCalls, 0);
  });
});
