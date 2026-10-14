// Regression test for the Individual-tab sign-in fix in
// src/components/officeneed/CustomerAuthModal.tsx: the Individual tab's
// sign-in branch now awaits useB2BStore's resolve() before declaring
// success, exactly like the Company tab already did. This file tests the
// store (src/stores/b2bStore.ts) that both branches share -- proving the
// actual mechanism the modal now relies on: `resolved` correctly stays
// false for the whole in-flight window (so price-bearing UI gated on it,
// see useB2BPriceOverlayMap in src/lib/shopify-overlay.ts, never treats an
// unresolved customer as B2C), and a real B2B customer who happens to sign
// in through the Individual tab still ends up correctly classified "b2b"
// once resolution completes -- with no second mechanism, no tab/entryType
// input anywhere in this store.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/stores/b2bStore.resolve-gating.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";

if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
if (typeof globalThis.window === "undefined") {
  globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
}

// Models resolveB2BSession's real result shape (src/lib/b2b.functions.ts)
// without needing the real server runtime -- the store only ever calls
// this as a plain async function and reacts to its return value.
let resolveDelayMs = {};
const TOKEN_RESULT = {}; // token -> { status: "b2c" } | { status: "b2b", locations, customerId }

mock.module("@/lib/b2b.functions", {
  namedExports: {
    resolveB2BSession: async ({ data: { customerAccessToken: token } }) => {
      const delay = resolveDelayMs[token] ?? 0;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return TOKEN_RESULT[token] ?? { status: "b2c", customerId: null };
    },
  },
});

const { useB2BStore } = await import("@/stores/b2bStore");

function resetStore() {
  useB2BStore.setState({
    status: "idle",
    locations: [],
    companyLocationId: null,
    customerId: null,
    resolvedForToken: null,
    resolved: false,
  });
}

test("a real B2B customer who signs in through the Individual tab (no tab input exists in this store) still resolves to b2b once resolution completes -- same mechanism, same result as the Company tab", async () => {
  resetStore();
  resolveDelayMs = {};
  TOKEN_RESULT["token-individual-tab-b2b-customer"] = {
    status: "b2b",
    locations: [{ id: "gid://shopify/CompanyLocation/9", name: "Acme" }],
    customerId: "gid://shopify/Customer/111",
  };

  await useB2BStore.getState().resolve("token-individual-tab-b2b-customer");

  const state = useB2BStore.getState();
  assert.equal(state.status, "b2b");
  assert.equal(state.resolved, true);
  assert.equal(state.companyLocationId, "gid://shopify/CompanyLocation/9");
});

test("while resolution for a B2B customer is still in flight, `resolved` stays false the entire time -- price-bearing UI gated on it (useB2BPriceOverlayMap) never treats this window as a confirmed B2C customer", async () => {
  resetStore();
  resolveDelayMs = { "token-slow-b2b": 50 };
  TOKEN_RESULT["token-slow-b2b"] = {
    status: "b2b",
    locations: [{ id: "gid://shopify/CompanyLocation/9", name: "Acme" }],
    customerId: "gid://shopify/Customer/111",
  };

  const pending = useB2BStore.getState().resolve("token-slow-b2b");

  // Checked synchronously right after resolve() is invoked, and again
  // partway through its delay -- both times before the awaited promise
  // settles. This is exactly the window the modal's fix now waits out
  // before showing "Successfully logged in" / letting the sign-in call
  // return, instead of assuming B2C immediately.
  assert.equal(useB2BStore.getState().resolved, false, "resolved must be false immediately after resolve() starts");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(useB2BStore.getState().status, "resolving");
  assert.equal(useB2BStore.getState().resolved, false, "resolved must still be false mid-flight, never flip true until the real result is known");

  await pending;
  assert.equal(useB2BStore.getState().resolved, true);
  assert.equal(useB2BStore.getState().status, "b2b", "once resolution completes, the true account type (b2b) must be reflected -- never left at a B2C assumption");
});

test("a real B2C customer signing in through the Individual tab still resolves to b2c normally -- no regression from the added await", async () => {
  resetStore();
  resolveDelayMs = {};
  TOKEN_RESULT["token-individual-tab-b2c-customer"] = { status: "b2c", customerId: "gid://shopify/Customer/222" };

  await useB2BStore.getState().resolve("token-individual-tab-b2c-customer");

  const state = useB2BStore.getState();
  assert.equal(state.status, "b2c");
  assert.equal(state.resolved, true);
  assert.equal(state.companyLocationId, null);
});

test("a customer with a pending B2B application resolves to 'pending', not 'b2c' or 'b2b' -- purely informational, no location/pricing access granted", async () => {
  resetStore();
  resolveDelayMs = {};
  TOKEN_RESULT["token-pending-applicant"] = { status: "pending", customerId: "gid://shopify/Customer/333" };

  await useB2BStore.getState().resolve("token-pending-applicant");

  const state = useB2BStore.getState();
  assert.equal(state.status, "pending");
  assert.equal(state.resolved, true);
  assert.equal(state.companyLocationId, null);
  assert.equal(state.locations.length, 0);
});

test("a slower, now-stale resolve() for a previous token must not overwrite a newer token's result -- the modal awaiting resolve() per sign-in relies on this guard when a customer signs out and back in quickly", async () => {
  resetStore();
  resolveDelayMs = { "token-old": 50, "token-new": 0 };
  TOKEN_RESULT["token-old"] = { status: "b2b", locations: [{ id: "gid://shopify/CompanyLocation/1", name: "Old Co" }], customerId: "gid://shopify/Customer/111" };
  TOKEN_RESULT["token-new"] = { status: "b2c", customerId: "gid://shopify/Customer/222" };

  const stale = useB2BStore.getState().resolve("token-old");
  const fresh = useB2BStore.getState().resolve("token-new");

  await Promise.all([stale, fresh]);

  const state = useB2BStore.getState();
  assert.equal(state.resolvedForToken, "token-new", "the newer resolve must win");
  assert.equal(state.status, "b2c");
});
