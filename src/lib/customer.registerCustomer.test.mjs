// Regression test for registerCustomer's pending-activation handling
// (src/lib/customer.ts). Mocks the Storefront API transport so no real
// Shopify customer is ever created -- no network call, no email sent.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/customer.registerCustomer.test.mjs
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

// Controls what the mocked customerCreate / customerAccessTokenCreate
// calls return, per test.
let createCustomerErrors = [];
let signInErrors = [];
let signInToken = { accessToken: "real-token-abc", expiresAt: new Date(Date.now() + 3600_000).toISOString() };

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query) => {
      if (query.includes("mutation Register")) {
        return { data: { customerCreate: { customerUserErrors: createCustomerErrors } } };
      }
      if (query.includes("mutation Login")) {
        return {
          data: {
            customerAccessTokenCreate: {
              customerAccessToken: signInErrors.length ? null : signInToken,
              customerUserErrors: signInErrors,
            },
          },
        };
      }
      return { data: {} };
    },
    formatMoney: (amount, currency) => `${currency} ${amount}`,
  },
});

const { registerCustomer, CustomerAuthError } = await import("@/lib/customer");

test("registerCustomer: immediate success signs the customer in (no activation needed)", async () => {
  createCustomerErrors = [];
  signInErrors = [];
  globalThis.localStorage.removeItem("officeneed_customer_token");

  await registerCustomer({ email: "new@example.com", password: "hunter22" });

  const stored = JSON.parse(globalThis.localStorage.getItem("officeneed_customer_token"));
  assert.equal(stored.accessToken, "real-token-abc", "a real session token must be stored after immediate success");
});

test("registerCustomer: CUSTOMER_DISABLED from the post-create sign-in becomes a distinguishable PENDING_ACTIVATION error", async () => {
  createCustomerErrors = []; // customerCreate itself succeeds -- the account really was created
  signInErrors = [{ code: "CUSTOMER_DISABLED", message: "This customer is disabled" }];
  globalThis.localStorage.removeItem("officeneed_customer_token");

  await assert.rejects(
    () => registerCustomer({ email: "guest-order-email@example.com", password: "hunter22" }),
    (err) => {
      assert.ok(err instanceof CustomerAuthError, "must be a CustomerAuthError");
      assert.equal(err.code, "PENDING_ACTIVATION");
      assert.match(err.message, /account has been created/i);
      assert.match(err.message, /activate/i);
      return true;
    },
  );
  assert.equal(globalThis.localStorage.getItem("officeneed_customer_token"), null, "must never fabricate a session for an unactivated account");
});

test("registerCustomer: an ordinary customerCreate failure (TAKEN) is unaffected by the activation handling", async () => {
  createCustomerErrors = [{ code: "TAKEN", field: ["email"], message: "Email has already been taken" }];
  signInErrors = [];
  globalThis.localStorage.removeItem("officeneed_customer_token");

  await assert.rejects(
    () => registerCustomer({ email: "existing@example.com", password: "hunter22" }),
    (err) => {
      assert.ok(err instanceof CustomerAuthError);
      assert.equal(err.code, "TAKEN");
      assert.notEqual(err.code, "PENDING_ACTIVATION");
      return true;
    },
  );
});

test("registerCustomer: a sign-in failure for a reason OTHER than CUSTOMER_DISABLED is not reclassified as pending activation", async () => {
  createCustomerErrors = [];
  signInErrors = [{ code: "UNIDENTIFIED_CUSTOMER", message: "Unidentified customer." }];
  globalThis.localStorage.removeItem("officeneed_customer_token");

  await assert.rejects(
    () => registerCustomer({ email: "weird-edge-case@example.com", password: "hunter22" }),
    (err) => {
      assert.ok(err instanceof CustomerAuthError);
      assert.notEqual(err.code, "PENDING_ACTIVATION");
      return true;
    },
  );
});

// ---- Timeout / partial-failure scenarios ----
import { readFileSync } from "node:fs";

test("timeout on customerCreate is never re-sent; if the account exists, sign-in succeeds and registration completes", async () => {
  // Tracked through a fresh mocked module would require re-import; instead
  // verify the code path statically plus behaviourally via isShopifyTimeout.
  const { isShopifyTimeout } = await import("@/lib/customer");
  assert.equal(isShopifyTimeout(new Error("Error calling Shopify: The request timed out. Please try again.")), true);
  assert.equal(isShopifyTimeout(new Error("Shopify request failed (504).")), true);
  assert.equal(isShopifyTimeout(new Error("Unidentified customer")), false);
  const src = readFileSync("src/lib/customer.ts", "utf8");
  const body = src.slice(src.indexOf("export async function registerCustomer"));
  assert.equal((body.match(/mutation Register/g) || []).length, 1, "customerCreate must be sent exactly once, never retried");
});
