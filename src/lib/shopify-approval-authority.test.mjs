// Shopify Admin is the only B2B approval authority.
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/shopify-approval-authority.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { checkShopifyApprovalImpl, WEBSITE_B2B_APPROVAL_ENABLED } = await import("@/lib/admin-b2b.functions");

function fake(rows) {
  const tables = { user_roles: [{ user_id: "admin-1", role: "admin" }], business_account_requests: rows };
  return {
    _tables: tables,
    from(t) {
      const f = []; let patch = null;
      const b = {
        select() { return b; },
        eq(k, v) { f.push([k, v]); return b; },
        update(p) { patch = p; return b; },
        maybeSingle() { return Promise.resolve({ data: tables[t].find((r) => f.every(([k, v]) => r[k] === v)) ?? null, error: null }); },
        then(res) { for (const r of tables[t].filter((r) => f.every(([k, v]) => r[k] === v))) Object.assign(r, patch); res({ error: null }); },
      };
      return b;
    },
  };
}
const ctx = (s) => ({ supabase: s, userId: "admin-1" });

test("website approval is disabled", () => assert.equal(WEBSITE_B2B_APPROVAL_ENABLED, false));

test("no Shopify company link: pending stays pending", async () => {
  const s = fake([{ id: "r1", status: "pending", shopify_customer_id: "gid://shopify/Customer/1" }]);
  const r = await checkShopifyApprovalImpl({ requestId: "r1" }, ctx(s), { resolveLocations: async () => [] });
  assert.equal(r.linked, false);
  assert.equal(s._tables.business_account_requests[0].status, "pending");
});

test("Shopify link exists: record mirrored as approved", async () => {
  const s = fake([{ id: "r2", status: "pending", shopify_customer_id: "gid://shopify/Customer/2" }]);
  const r = await checkShopifyApprovalImpl({ requestId: "r2" }, ctx(s), { resolveLocations: async () => [{ id: "L", name: "Acme" }] });
  assert.equal(r.linked, true);
  assert.equal(s._tables.business_account_requests[0].status, "approved");
});

test("non-admin cannot check status", async () => {
  const s = fake([{ id: "r3", status: "pending", shopify_customer_id: "x" }]);
  s._tables.user_roles = [];
  await assert.rejects(() => checkShopifyApprovalImpl({ requestId: "r3" }, ctx(s), { resolveLocations: async () => [] }), /Forbidden/);
});

test("access decision never reads the saved approved status", () => {
  const src = readFileSync("src/lib/b2b.functions.ts", "utf8");
  assert.ok(!/eq\("status",\s*"approved"\)/.test(src));
});

test("registration never calls Shopify company mutations", () => {
  const src = readFileSync("src/lib/business-registration.functions.ts", "utf8");
  assert.ok(!/companyCreate|companyAssignCustomerAsContact|companyContactAssignRole|provisionShopifyCompany/.test(src));
});
