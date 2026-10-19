// Unit tests for src/lib/shopping-mode.ts -- the per-customer localStorage
// wrapper that persists a shopper's chosen Personal/Business Shopping mode.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/shopping-mode.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};

const { readPersistedShoppingMode, writePersistedShoppingMode } = await import("@/lib/shopping-mode");

test("read/write round-trip for a given customerId", () => {
  writePersistedShoppingMode("gid://shopify/Customer/1", "b2c");
  assert.equal(readPersistedShoppingMode("gid://shopify/Customer/1"), "b2c");

  writePersistedShoppingMode("gid://shopify/Customer/1", "b2b");
  assert.equal(readPersistedShoppingMode("gid://shopify/Customer/1"), "b2b");
});

test("two different customerIds never collide", () => {
  writePersistedShoppingMode("gid://shopify/Customer/A", "b2b");
  writePersistedShoppingMode("gid://shopify/Customer/B", "b2c");
  assert.equal(readPersistedShoppingMode("gid://shopify/Customer/A"), "b2b");
  assert.equal(readPersistedShoppingMode("gid://shopify/Customer/B"), "b2c");
});

test("a customerId that was never written to returns null", () => {
  assert.equal(readPersistedShoppingMode("gid://shopify/Customer/never-written"), null);
});

test("a corrupt/garbage stored value returns null, never throws", () => {
  store.set("officeneed_shopping_mode:gid://shopify/Customer/garbage", "not-a-real-mode");
  assert.equal(readPersistedShoppingMode("gid://shopify/Customer/garbage"), null);
});

test("a missing/null customerId is a no-op for both read and write", () => {
  assert.equal(readPersistedShoppingMode(null), null);
  // Must not throw, and must not write anything observable.
  writePersistedShoppingMode(null, "b2b");
  assert.equal(readPersistedShoppingMode(null), null);
});
