// registerCustomer behaviour when Shopify times out. No real Shopify calls.
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/customer.registerTimeout.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };

const calls = { create: 0, login: 0 };
let createMode = "timeout"; // "timeout" | "ok"
let loginMode = "ok"; // "ok" | "invalid" | "timeout"
const TIMEOUT = () => { throw new Error("Error calling Shopify: The request timed out. Please try again."); };

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query) => {
      if (query.includes("mutation Register")) {
        calls.create++;
        if (createMode === "timeout") TIMEOUT();
        return { data: { customerCreate: { customerUserErrors: [] } } };
      }
      if (query.includes("mutation Login")) {
        calls.login++;
        if (loginMode === "timeout") TIMEOUT();
        const ok = loginMode === "ok";
        return { data: { customerAccessTokenCreate: {
          customerAccessToken: ok ? { accessToken: "tok", expiresAt: new Date(Date.now() + 3600e3).toISOString() } : null,
          customerUserErrors: ok ? [] : [{ code: "UNIDENTIFIED_CUSTOMER", message: "Unidentified customer." }],
        } } };
      }
      return { data: {} };
    },
    formatMoney: (a, c) => `${c} ${a}`,
  },
});

const { registerCustomer, CustomerAuthError } = await import("@/lib/customer");
const reset = () => { calls.create = 0; calls.login = 0; store.clear(); };

test("create timed out but the account was actually created: signs in, never re-sends customerCreate", async () => {
  reset(); createMode = "timeout"; loginMode = "ok";
  await registerCustomer({ email: "a@example.com", password: "hunter22" });
  assert.equal(calls.create, 1);
  assert.equal(calls.login, 1);
  assert.ok(store.get("officeneed_customer_token"));
});

test("create timed out and the account does not exist: friendly 'unconfirmed' error, still only one customerCreate", async () => {
  reset(); createMode = "timeout"; loginMode = "invalid";
  await assert.rejects(registerCustomer({ email: "b@example.com", password: "hunter22" }), (e) => e instanceof CustomerAuthError && e.code === "REGISTRATION_UNCONFIRMED" && !/timed out/i.test(e.message));
  assert.equal(calls.create, 1);
  assert.equal(store.get("officeneed_customer_token"), undefined);
});

test("create succeeded but sign-in timed out: tells the customer to sign in, no second customerCreate", async () => {
  reset(); createMode = "ok"; loginMode = "timeout";
  await assert.rejects(registerCustomer({ email: "c@example.com", password: "hunter22" }), (e) => e instanceof CustomerAuthError && e.code === "SIGN_IN_AFTER_CREATE_TIMEOUT");
  assert.equal(calls.create, 1);
});
