// Unit tests for the shoppingMode concept added to src/stores/b2bStore.ts --
// a user-selectable "which experience is the shopper actively using right
// now", layered on top of `status` (server-resolved eligibility, untouched
// by this feature). See getEffectiveCompanyLocationId, the one function
// every B2B-pricing/quantity-rule/buyer-identity call site reads through.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/stores/b2bStore.shopping-mode.test.mjs
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

let resolveDelayMs = {};
const TOKEN_RESULT = {};
mock.module("@/lib/b2b.functions", {
  namedExports: {
    resolveB2BSession: async ({ data: { customerAccessToken: token } }) => {
      const delay = resolveDelayMs[token] ?? 0;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return TOKEN_RESULT[token] ?? { status: "b2c", customerId: null };
    },
  },
});

const { useB2BStore, getEffectiveCompanyLocationId } = await import("@/stores/b2bStore");

function resetStore() {
  useB2BStore.setState({
    status: "idle",
    locations: [],
    companyLocationId: null,
    customerId: null,
    resolvedForToken: null,
    resolved: false,
    shoppingMode: "b2c",
  });
}

test("resolve(): a single-location B2B customer defaults to shoppingMode 'b2b' with no persisted preference", async () => {
  resetStore();
  TOKEN_RESULT["token-b2b-default"] = {
    status: "b2b",
    locations: [{ id: "gid://shopify/CompanyLocation/1", name: "Acme" }],
    customerId: "gid://shopify/Customer/default-b2b",
  };
  await useB2BStore.getState().resolve("token-b2b-default");
  assert.equal(useB2BStore.getState().shoppingMode, "b2b");
});

test("resolve(): respects a previously persisted 'b2c' choice for the SAME customerId", async () => {
  resetStore();
  localStorage.setItem("officeneed_shopping_mode:gid://shopify/Customer/persisted-b2c", "b2c");
  TOKEN_RESULT["token-persisted-b2c"] = {
    status: "b2b",
    locations: [{ id: "gid://shopify/CompanyLocation/2", name: "Acme" }],
    customerId: "gid://shopify/Customer/persisted-b2c",
  };
  await useB2BStore.getState().resolve("token-persisted-b2c");
  assert.equal(useB2BStore.getState().status, "b2b", "eligibility is unaffected by the persisted mode choice");
  assert.equal(useB2BStore.getState().shoppingMode, "b2c");
});

test("resolve(): a persisted mode keyed to a DIFFERENT customerId is never read back", async () => {
  resetStore();
  localStorage.setItem("officeneed_shopping_mode:gid://shopify/Customer/someone-else", "b2c");
  TOKEN_RESULT["token-different-customer"] = {
    status: "b2b",
    locations: [{ id: "gid://shopify/CompanyLocation/3", name: "Acme" }],
    customerId: "gid://shopify/Customer/this-one",
  };
  await useB2BStore.getState().resolve("token-different-customer");
  // No entry for "this-one" -> falls back to the default, "b2b".
  assert.equal(useB2BStore.getState().shoppingMode, "b2b");
});

test("resolve(): b2c and pending outcomes always force shoppingMode to 'b2c'", async () => {
  resetStore();
  localStorage.setItem("officeneed_shopping_mode:gid://shopify/Customer/b2c-outcome", "b2b"); // garbage/stale -- must never matter
  TOKEN_RESULT["token-b2c-outcome"] = { status: "b2c", customerId: "gid://shopify/Customer/b2c-outcome" };
  await useB2BStore.getState().resolve("token-b2c-outcome");
  assert.equal(useB2BStore.getState().shoppingMode, "b2c");

  resetStore();
  TOKEN_RESULT["token-pending-outcome"] = { status: "pending", customerId: "gid://shopify/Customer/pending" };
  await useB2BStore.getState().resolve("token-pending-outcome");
  assert.equal(useB2BStore.getState().shoppingMode, "b2c");
});

test("resolve(): a multi-location (needs-location) customer also gets the same default/persisted logic", async () => {
  resetStore();
  TOKEN_RESULT["token-needs-location"] = {
    status: "b2b",
    locations: [
      { id: "gid://shopify/CompanyLocation/4", name: "Acme HQ" },
      { id: "gid://shopify/CompanyLocation/5", name: "Acme Branch" },
    ],
    customerId: "gid://shopify/Customer/multi",
  };
  await useB2BStore.getState().resolve("token-needs-location");
  assert.equal(useB2BStore.getState().status, "needs-location");
  assert.equal(useB2BStore.getState().shoppingMode, "b2b");
});

test("setShoppingMode('b2b') is rejected when status is not 'b2b'/'needs-location'", () => {
  resetStore();
  useB2BStore.setState({ status: "b2c" });
  assert.equal(useB2BStore.getState().setShoppingMode("b2b"), false);
  assert.equal(useB2BStore.getState().shoppingMode, "b2c");

  useB2BStore.setState({ status: "pending" });
  assert.equal(useB2BStore.getState().setShoppingMode("b2b"), false);

  useB2BStore.setState({ status: "idle" });
  assert.equal(useB2BStore.getState().setShoppingMode("b2b"), false);
});

test("setShoppingMode('b2b') succeeds when status is 'b2b' or 'needs-location'", () => {
  resetStore();
  useB2BStore.setState({ status: "b2b" });
  assert.equal(useB2BStore.getState().setShoppingMode("b2b"), true);
  assert.equal(useB2BStore.getState().shoppingMode, "b2b");

  resetStore();
  useB2BStore.setState({ status: "needs-location" });
  assert.equal(useB2BStore.getState().setShoppingMode("b2b"), true);
  assert.equal(useB2BStore.getState().shoppingMode, "b2b");
});

test("setShoppingMode('b2c') always succeeds, regardless of status", () => {
  resetStore();
  useB2BStore.setState({ status: "b2b", shoppingMode: "b2b" });
  assert.equal(useB2BStore.getState().setShoppingMode("b2c"), true);
  assert.equal(useB2BStore.getState().shoppingMode, "b2c");
});

test("setShoppingMode persists the choice for the current customerId", () => {
  resetStore();
  useB2BStore.setState({ status: "b2b", customerId: "gid://shopify/Customer/persist-check" });
  useB2BStore.getState().setShoppingMode("b2c");
  assert.equal(localStorage.getItem("officeneed_shopping_mode:gid://shopify/Customer/persist-check"), "b2c");
});

test("getEffectiveCompanyLocationId: truth table across status x shoppingMode", () => {
  const base = { companyLocationId: "gid://shopify/CompanyLocation/X" };
  assert.equal(getEffectiveCompanyLocationId({ ...base, status: "b2b", shoppingMode: "b2b" }), "gid://shopify/CompanyLocation/X");
  assert.equal(getEffectiveCompanyLocationId({ ...base, status: "b2b", shoppingMode: "b2c" }), null, "eligible but shopping personally");
  assert.equal(getEffectiveCompanyLocationId({ ...base, status: "needs-location", shoppingMode: "b2b" }), null, "no location picked yet, even in b2b mode");
  assert.equal(getEffectiveCompanyLocationId({ ...base, status: "b2c", shoppingMode: "b2b" }), null, "not eligible, regardless of mode");
  assert.equal(getEffectiveCompanyLocationId({ ...base, status: "pending", shoppingMode: "b2b" }), null);
  assert.equal(getEffectiveCompanyLocationId({ ...base, status: "idle", shoppingMode: "b2b" }), null);
});

test("reset() resets shoppingMode to 'b2c'", () => {
  resetStore();
  useB2BStore.setState({ status: "b2b", shoppingMode: "b2b" });
  useB2BStore.getState().reset();
  assert.equal(useB2BStore.getState().shoppingMode, "b2c");
  assert.equal(useB2BStore.getState().status, "idle");
});
