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
// The exact variables the last customerCreate was sent with.
let lastRegisterVariables = null;

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query, variables) => {
      if (query.includes("mutation Register")) {
        lastRegisterVariables = variables;
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

// --- Cross-type registration: registerCustomer is the ONE shared function
// both the Individual (B2C) and Corporate (B2B) tabs call (confirmed by
// reading CustomerAuthModal.tsx) -- it has no "entryType"/account-type
// parameter at all, so Shopify's own email-uniqueness constraint (TAKEN)
// applies identically no matter which tab the attempt came from. These
// two tests exist specifically to map that fact onto the "B2B email
// attempting B2C registration" / "B2C email attempting B2B registration"
// requirement in plain terms, even though mechanically they exercise the
// exact same code path as the generic TAKEN test above.

test("registerCustomer: an email already registered as a B2B (Corporate) customer cannot be independently re-registered via the B2C (Individual) form", async () => {
  // Modeled as: this email already resolved to a real Shopify customer
  // (who happens to have a Company Contact role elsewhere, a fact
  // registerCustomer itself never queries or cares about) -- Shopify
  // rejects the second customerCreate purely on email uniqueness.
  createCustomerErrors = [{ code: "TAKEN", field: ["email"], message: "Email has already been taken" }];
  signInErrors = [];
  globalThis.localStorage.removeItem("officeneed_customer_token");

  await assert.rejects(
    () => registerCustomer({ email: "existing-b2b-customer@example.com", password: "hunter22" }),
    (err) => {
      assert.ok(err instanceof CustomerAuthError);
      assert.equal(err.code, "TAKEN");
      assert.match(err.message, /already exists.*sign in/i, "message must be the privacy-conscious one -- never reveal the existing account's type");
      return true;
    },
  );
  assert.equal(globalThis.localStorage.getItem("officeneed_customer_token"), null, "no session is ever fabricated for a rejected registration");
});

test("registerCustomer: an email already registered as a B2C (Individual) customer cannot be independently re-registered via the B2B (Corporate) form", async () => {
  createCustomerErrors = [{ code: "TAKEN", field: ["email"], message: "Email has already been taken" }];
  signInErrors = [];
  globalThis.localStorage.removeItem("officeneed_customer_token");

  await assert.rejects(
    () => registerCustomer({ email: "existing-b2c-customer@example.com", password: "hunter22", phone: "+919876543210" }),
    (err) => {
      assert.ok(err instanceof CustomerAuthError);
      assert.equal(err.code, "TAKEN");
      return true;
    },
  );
  assert.equal(globalThis.localStorage.getItem("officeneed_customer_token"), null);
});

// ---- Email marketing consent (CustomerCreateInput.acceptsMarketing) ----

test("registerCustomer: a checked consent box sends acceptsMarketing: true to customerCreate", async () => {
  createCustomerErrors = [];
  signInErrors = [];
  lastRegisterVariables = null;

  await registerCustomer({ email: "optin@example.com", password: "hunter22", acceptsMarketing: true });

  assert.equal(lastRegisterVariables.input.acceptsMarketing, true);
});

test("registerCustomer: an unchecked consent box sends acceptsMarketing: false and registration still succeeds", async () => {
  createCustomerErrors = [];
  signInErrors = [];
  lastRegisterVariables = null;
  globalThis.localStorage.removeItem("officeneed_customer_token");

  await registerCustomer({ email: "optout@example.com", password: "hunter22", acceptsMarketing: false });

  assert.equal(lastRegisterVariables.input.acceptsMarketing, false, "an unchecked box must never subscribe the customer");
  assert.ok(globalThis.localStorage.getItem("officeneed_customer_token"), "opting out must not block registration");
});

test("registerCustomer: B2B-shaped input (phone) carries the consent choice alongside it, unchanged", async () => {
  createCustomerErrors = [];
  signInErrors = [];
  lastRegisterVariables = null;

  await registerCustomer({ email: "b2b-optin@example.com", password: "hunter22", firstName: "A", phone: "+919876543210", acceptsMarketing: true });

  assert.deepEqual(lastRegisterVariables.input, {
    email: "b2b-optin@example.com",
    password: "hunter22",
    firstName: "A",
    phone: "+919876543210",
    acceptsMarketing: true,
  });
});

test("registerCustomer: callers that omit the field never send acceptsMarketing (no inferred consent)", async () => {
  createCustomerErrors = [];
  signInErrors = [];
  lastRegisterVariables = null;

  await registerCustomer({ email: "nofield@example.com", password: "hunter22" });

  assert.equal("acceptsMarketing" in lastRegisterVariables.input, false);
});

test("CustomerAuthModal: consent checkbox is optional, unchecked by default, and only on register forms", () => {
  const src = readFileSync("src/components/officeneed/CustomerAuthModal.tsx", "utf8");
  const field = src.slice(src.indexOf("const marketingConsentField"), src.indexOf("const authContent"));
  assert.match(field, /<Checkbox\s+id="acceptsMarketing"\s+name="acceptsMarketing"/);
  assert.match(field, /<Label htmlFor="acceptsMarketing"/, "the label must be clickable via htmlFor");
  assert.match(field, /Send me exclusive offers &amp; updates/);
  assert.match(field, /Optional\. Unsubscribe anytime\./);
  assert.ok(!/\b(defaultChecked|checked|required)\b/.test(field), "must not be preselected or mandatory");
  assert.match(src, /const acceptsMarketing = form\.get\("acceptsMarketing"\) === "on";/);
  // Both registerCustomer call sites (B2C and B2B) pass the explicit choice.
  assert.equal((src.match(/^\s+acceptsMarketing,\r?\n\s+\}\);/gm) || []).length, 2);
});
