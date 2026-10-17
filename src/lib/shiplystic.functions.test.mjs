// Regression test for src/lib/shiplystic.functions.ts's plain, directly-
// testable core (trackShipment takes fetchImpl as an injected dependency,
// so no mock.module() is needed here -- a fake fetchImpl per test, same
// spirit as newsletter.functions.ts's fake Supabase client).
//
// Run with: npx tsx --test src/lib/shiplystic.functions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIdentifier,
  checkShiplysticRateLimit,
  trackShipment,
  sortTrackingEvents,
} from "./shiplystic.functions";

const DEPS = { baseUrl: "https://app.shiplystic.com", token: "test-token" };

function fakeFetch(impl) {
  return async (url, init) => impl(url, init);
}

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

// --- parseIdentifier ---

test("parseIdentifier: a valid AWB passes through trimmed", () => {
  const result = parseIdentifier("  AWB12345  ");
  assert.deepEqual(result, { ok: true, value: "AWB12345" });
});

test("parseIdentifier: an order id containing # is valid", () => {
  assert.deepEqual(parseIdentifier("#OFN1234"), { ok: true, value: "#OFN1234" });
});

test("parseIdentifier: empty or whitespace-only input is rejected", () => {
  assert.deepEqual(parseIdentifier(""), { ok: false, reason: "empty" });
  assert.deepEqual(parseIdentifier("   "), { ok: false, reason: "empty" });
  assert.deepEqual(parseIdentifier(undefined), { ok: false, reason: "empty" });
});

test("parseIdentifier: over 64 characters is rejected", () => {
  assert.deepEqual(parseIdentifier("A".repeat(65)), { ok: false, reason: "too_long" });
});

test("parseIdentifier: a disallowed character is rejected", () => {
  assert.deepEqual(parseIdentifier("AWB 123<script>"), { ok: false, reason: "invalid_characters" });
});

// --- trackShipment: found ---

test("trackShipment: AWB found via the Waybill field", async () => {
  const fetchImpl = fakeFetch(async () =>
    jsonResponse({ results: [{ Waybill: "AWB1", CurrentStatus: "In Transit", Courier: "Delhivery" }] }),
  );
  const outcome = await trackShipment("AWB1", { ...DEPS, fetchImpl });
  assert.equal(outcome.state, "found");
  assert.equal(outcome.shipment.waybill, "AWB1");
  assert.equal(outcome.shipment.currentStatus, "In Transit");
  assert.equal(outcome.shipment.courier, "Delhivery");
});

test("trackShipment: tracking-number-only match is found (no Waybill/AWB present)", async () => {
  const fetchImpl = fakeFetch(async () => jsonResponse({ results: [{ TrackingNumber: "TRK999", CurrentStatus: "Delivered" }] }));
  const outcome = await trackShipment("TRK999", { ...DEPS, fetchImpl });
  assert.equal(outcome.state, "found");
  assert.equal(outcome.shipment.trackingNumber, "TRK999");
});

test("trackShipment: Order-ID match is found even when notFound/notFoundCount claim failure (the documented quirk)", async () => {
  const fetchImpl = fakeFetch(async () =>
    jsonResponse({
      success: false,
      foundCount: 0,
      totalRequested: 1,
      notFound: ["ORDER123"],
      notFoundCount: 1,
      results: [{ EnteredOrderId: "ORDER123", OrderStatus: "Processing" }],
    }),
  );
  const outcome = await trackShipment("ORDER123", { ...DEPS, fetchImpl });
  assert.equal(outcome.state, "found", "notFound must never be consulted -- results is the source of truth");
  assert.equal(outcome.shipment.enteredOrderId, "ORDER123");
});

// --- trackShipment: not found ---

test("trackShipment: empty results array -> not_found", async () => {
  const fetchImpl = fakeFetch(async () => jsonResponse({ results: [] }));
  const outcome = await trackShipment("NOPE", { ...DEPS, fetchImpl });
  assert.deepEqual(outcome, { state: "not_found", query: "NOPE" });
});

test("trackShipment: results entirely absent from the response -> not_found", async () => {
  const fetchImpl = fakeFetch(async () => jsonResponse({ success: true }));
  const outcome = await trackShipment("NOPE", { ...DEPS, fetchImpl });
  assert.equal(outcome.state, "not_found");
});

// --- trackShipment: defensive null/missing fields ---

test("trackShipment: a found result with every optional field null/missing never throws and normalizes to null, events default to []", async () => {
  const fetchImpl = fakeFetch(async () => jsonResponse({ results: [{ Waybill: "AWB2" }] }));
  const outcome = await trackShipment("AWB2", { ...DEPS, fetchImpl });
  assert.equal(outcome.state, "found");
  assert.equal(outcome.shipment.courier, null);
  assert.equal(outcome.shipment.currentStatus, null);
  assert.equal(outcome.shipment.pickupCity, null);
  assert.deepEqual(outcome.shipment.events, []);
});

test("trackShipment: a non-array events field is coerced to an empty array, not thrown", async () => {
  const fetchImpl = fakeFetch(async () => jsonResponse({ results: [{ Waybill: "AWB3", TrackingEvents: "not-an-array" }] }));
  const outcome = await trackShipment("AWB3", { ...DEPS, fetchImpl });
  assert.equal(outcome.state, "found");
  assert.deepEqual(outcome.shipment.events, []);
});

// --- trackShipment: failure modes ---

test("trackShipment: a malformed JSON body -> malformed_response", async () => {
  const fetchImpl = fakeFetch(async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }));
  const outcome = await trackShipment("AWB1", { ...DEPS, fetchImpl });
  assert.deepEqual(outcome, { state: "malformed_response" });
});

test("trackShipment: an upstream 500 -> upstream_error with that status, no body leaked", async () => {
  const fetchImpl = fakeFetch(async () => ({ ok: false, status: 500, json: async () => ({ message: "secret internal detail" }) }));
  const outcome = await trackShipment("AWB1", { ...DEPS, fetchImpl });
  assert.deepEqual(outcome, { state: "upstream_error", status: 500 });
});

test("trackShipment: an upstream 404 -> upstream_error with that status", async () => {
  const fetchImpl = fakeFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }));
  const outcome = await trackShipment("AWB1", { ...DEPS, fetchImpl });
  assert.deepEqual(outcome, { state: "upstream_error", status: 404 });
});

test("trackShipment: a network throw -> network_error", async () => {
  const fetchImpl = fakeFetch(async () => { throw new Error("getaddrinfo ENOTFOUND"); });
  const outcome = await trackShipment("AWB1", { ...DEPS, fetchImpl });
  assert.deepEqual(outcome, { state: "network_error" });
});

test("trackShipment: an aborted/timed-out request -> timeout, not network_error", async () => {
  const fetchImpl = fakeFetch(async (_url, init) => {
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        reject(err);
      });
    });
  });
  const outcome = await trackShipment("AWB1", { ...DEPS, fetchImpl, timeoutMs: 5 });
  assert.deepEqual(outcome, { state: "timeout" });
});

// --- checkShiplysticRateLimit ---

test("checkShiplysticRateLimit: allows up to RATE_LIMIT_MAX (30) requests in one window, rejects the 31st", () => {
  const key = "203.0.113.1";
  const now = 1_000_000;
  for (let i = 0; i < 30; i++) {
    assert.equal(checkShiplysticRateLimit(key, now), true, `request ${i + 1} should be allowed`);
  }
  assert.equal(checkShiplysticRateLimit(key, now), false, "the 31st request in the same window must be rejected");
});

test("checkShiplysticRateLimit: resets after the window elapses", () => {
  const key = "203.0.113.2";
  const now = 2_000_000;
  for (let i = 0; i < 30; i++) checkShiplysticRateLimit(key, now);
  assert.equal(checkShiplysticRateLimit(key, now), false);
  assert.equal(checkShiplysticRateLimit(key, now + 60_001), true, "a new window must allow requests again");
});

test("checkShiplysticRateLimit: different keys (IPs) have independent limits", () => {
  const now = 3_000_000;
  for (let i = 0; i < 30; i++) checkShiplysticRateLimit("203.0.113.3", now);
  assert.equal(checkShiplysticRateLimit("203.0.113.3", now), false);
  assert.equal(checkShiplysticRateLimit("203.0.113.4", now), true, "a different IP must not be affected by another IP's limit");
});

// --- sortTrackingEvents ---

test("sortTrackingEvents: valid timestamps are ordered newest-first", () => {
  const events = [
    { status: "Picked up", eventTime: "2026-01-01T10:00:00Z" },
    { status: "Delivered", eventTime: "2026-01-03T10:00:00Z" },
    { status: "In transit", eventTime: "2026-01-02T10:00:00Z" },
  ];
  const sorted = sortTrackingEvents(events);
  assert.deepEqual(sorted.map((e) => e.status), ["Delivered", "In transit", "Picked up"]);
});

test("sortTrackingEvents: events with a missing or unparseable eventTime are kept, appended after the timed ones", () => {
  const events = [
    { status: "Delivered", eventTime: "2026-01-03T10:00:00Z" },
    { status: "Unknown timing", eventTime: null },
    { status: "Bad timestamp", eventTime: "not-a-date" },
    { status: "Picked up", eventTime: "2026-01-01T10:00:00Z" },
  ];
  const sorted = sortTrackingEvents(events);
  assert.deepEqual(sorted.map((e) => e.status), ["Delivered", "Picked up", "Unknown timing", "Bad timestamp"]);
});
