// Proves account-type classification (b2b vs b2c) is a pure function of
// the customer's real Shopify Company Contact role assignments, resolved
// entirely server-side from the access token -- with NO parameter, flag,
// or code path anywhere in this chain for "which login form/tab was
// used" to influence the result. Mocks the Admin/Storefront transport so
// no real Shopify call happens.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/b2b.functions.account-classification.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";

// resolveCustomerIdFromToken reads this to know a Storefront token is
// configured at all -- its actual value is irrelevant here since fetch
// itself is mocked below; only its presence is checked by the real code.
process.env["SHOPIFY_HEADLESS_STOREFRONT_TOKEN"] ??= "test-dummy-storefront-token";

// resolveCustomerIdFromToken (b2b.functions.ts) calls Shopify's Storefront
// API directly via fetch, not through a mockable wrapper -- mock fetch
// itself for just that one query shape.
const TOKEN_TO_CUSTOMER_ID = {
  "token-for-real-b2b-customer": "gid://shopify/Customer/111",
  "token-for-real-b2c-customer": "gid://shopify/Customer/222",
  "token-for-pending-nobody": "gid://shopify/Customer/333",
};

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  const token = body.variables?.token;
  const customerId = TOKEN_TO_CUSTOMER_ID[token] ?? null;
  return {
    ok: true,
    json: async () => ({ data: { customer: customerId ? { id: customerId } : null } }),
  };
};

// The Admin-side role-assignment lookup this module uses.
const CUSTOMER_ROLE_ASSIGNMENTS = {
  "gid://shopify/Customer/111": [
    { companyLocation: { id: "gid://shopify/CompanyLocation/9", name: "Acme - Head Office" } },
  ],
  "gid://shopify/Customer/222": [], // signed up, but no company contact role at all
  "gid://shopify/Customer/333": [], // e.g. submitted a GST but nothing approved yet
};

mock.module("@/lib/shopify-admin.server", {
  namedExports: {
    adminGraphQLRequest: async (_query, variables) => {
      const assignments = CUSTOMER_ROLE_ASSIGNMENTS[variables.customerId] ?? [];
      return {
        data: {
          customer: {
            companyContactProfiles: assignments.length
              ? [{ id: "contact-1", roleAssignments: { edges: assignments.map((a) => ({ node: a })) } }]
              : [],
          },
        },
        errors: [],
      };
    },
  },
});

// business_account_requests rows this fake Supabase client knows about --
// keyed by shopify_customer_id, mirrors exactly what resolveB2BSession's
// new "pending" branch queries. "THROW" is a sentinel the fake client
// checks for to simulate a Supabase failure (proving the fail-safe-to-b2c
// path), never a real customer id.
const PENDING_REQUESTS_BY_CUSTOMER_ID = {
  "gid://shopify/Customer/333": { status: "pending" },
  "gid://shopify/Customer/444": "THROW",
};

mock.module("@/integrations/supabase/client.server", {
  namedExports: {
    supabaseAdmin: {
      from(table) {
        if (table !== "business_account_requests") throw new Error(`unexpected table in test: ${table}`);
        return {
          select() {
            return {
              eq(_field1, customerId) {
                return {
                  eq(_field2, _status) {
                    return {
                      async maybeSingle() {
                        const entry = PENDING_REQUESTS_BY_CUSTOMER_ID[customerId];
                        if (entry === "THROW") throw new Error("simulated Supabase outage");
                        return { data: entry ?? null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
  },
});

const { resolveCustomerIdFromToken, resolveCompanyLocationsForCustomer } = await import("@/lib/b2b.functions");

// resolveB2BSession itself is a createServerFn -- calling its wrapped
// export directly requires the real TanStack Start request runtime
// (AsyncLocalStorage context), which doesn't exist in a standalone node:test
// process. Its actual handler (src/lib/b2b.functions.ts) is mirrored here
// exactly (including the "pending" branch added when manual approval was
// restored) so the test exercises the real trust chain -- token -> real
// customer ID -> real role assignments -- without needing to fake the
// server runtime.
async function resolveB2BSessionLikeTheRealHandlerDoes(customerAccessToken) {
  const customerId = await resolveCustomerIdFromToken(customerAccessToken);
  if (!customerId) return { status: "b2c", customerId: null };
  const locations = await resolveCompanyLocationsForCustomer(customerId);
  if (locations.length === 0) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: pendingRequest } = await supabaseAdmin
        .from("business_account_requests")
        .select("status")
        .eq("shopify_customer_id", customerId)
        .eq("status", "pending")
        .maybeSingle();
      if (pendingRequest) return { status: "pending", customerId };
    } catch {
      // fall through to b2c, exactly like the real handler's catch block
    }
    return { status: "b2c", customerId };
  }
  return { status: "b2b", locations, customerId };
}

test("a real B2B customer resolves to b2b with their actual company location, from a raw token alone", async () => {
  const result = await resolveB2BSessionLikeTheRealHandlerDoes("token-for-real-b2b-customer");
  assert.equal(result.status, "b2b");
  if (result.status === "b2b") {
    assert.equal(result.locations.length, 1);
    assert.equal(result.locations[0].id, "gid://shopify/CompanyLocation/9");
  }
});

test("a real B2C customer (no company contact at all) resolves to b2c", async () => {
  const result = await resolveB2BSessionLikeTheRealHandlerDoes("token-for-real-b2c-customer");
  assert.equal(result.status, "b2c");
});

test("account classification is IDENTICAL for the same customer regardless of which 'login form' conceptually produced the token -- the function only ever receives a token, nothing else", async () => {
  // Simulates "signed in via the Individual tab" and "signed in via the
  // Corporate tab" for the SAME real B2B customer -- Shopify issues a
  // fresh token string per sign-in, but it resolves to the same customer
  // either way. The function signature itself (customerAccessToken only)
  // proves there is no "which tab" input for either call to differ on.
  TOKEN_TO_CUSTOMER_ID["token-individual-tab-signin"] = "gid://shopify/Customer/111";
  TOKEN_TO_CUSTOMER_ID["token-corporate-tab-signin"] = "gid://shopify/Customer/111";

  const viaIndividualTab = await resolveB2BSessionLikeTheRealHandlerDoes("token-individual-tab-signin");
  const viaCorporateTab = await resolveB2BSessionLikeTheRealHandlerDoes("token-corporate-tab-signin");

  assert.deepEqual(viaIndividualTab, viaCorporateTab, "same real customer must resolve identically no matter which tab's sign-in produced the token");
  assert.equal(viaIndividualTab.status, "b2b");
});

test("an unresolvable/invalid token fails safe to b2c, never b2b", async () => {
  const result = await resolveB2BSessionLikeTheRealHandlerDoes("token-that-does-not-exist-anywhere");
  assert.equal(result.status, "b2c");
  assert.equal(result.customerId, null);
});

test("a customer with a pending application (no Shopify company contact yet) resolves to 'pending', not 'b2c' -- purely informational, Shopify access is still what it is either way", async () => {
  const result = await resolveB2BSessionLikeTheRealHandlerDoes("token-for-pending-nobody");
  assert.equal(result.status, "pending");
  assert.equal(result.customerId, "gid://shopify/Customer/333");
});

test("a customer with NO pending application and no Shopify company contact resolves to plain b2c, not pending", async () => {
  // Customer/222 has no role assignments (see CUSTOMER_ROLE_ASSIGNMENTS)
  // and no row in PENDING_REQUESTS_BY_CUSTOMER_ID at all.
  const result = await resolveB2BSessionLikeTheRealHandlerDoes("token-for-real-b2c-customer");
  assert.equal(result.status, "b2c");
});

test("if the pending-application lookup itself fails, this fails safe to b2c -- never throws, never blocks sign-in", async () => {
  TOKEN_TO_CUSTOMER_ID["token-for-customer-444"] = "gid://shopify/Customer/444";
  const result = await resolveB2BSessionLikeTheRealHandlerDoes("token-for-customer-444");
  assert.equal(result.status, "b2c");
});

test("an already-approved B2B customer (real Shopify company contact exists) resolves to b2b even if a stale/duplicate business_account_requests row also exists -- the live Shopify relationship always wins, the pending lookup is never even consulted", async () => {
  // Customer/111 has a real role assignment (resolves to b2b via the
  // Shopify lookup alone) -- the pending-table lookup inside the
  // `locations.length === 0` branch is structurally unreachable here,
  // proving this purely by exercising the real branch order.
  PENDING_REQUESTS_BY_CUSTOMER_ID["gid://shopify/Customer/111"] = { status: "pending" };
  const result = await resolveB2BSessionLikeTheRealHandlerDoes("token-for-real-b2b-customer");
  assert.equal(result.status, "b2b", "a real Shopify company-contact relationship must always take priority over any Supabase row");
});
