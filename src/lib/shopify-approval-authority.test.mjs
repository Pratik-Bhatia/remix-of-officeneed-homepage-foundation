// Shopify Admin is the only B2B approval authority; the website dashboard is gone.
// Run with: npx tsx --test src/lib/shopify-approval-authority.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("website B2B approval dashboard is removed", () => {
  assert.equal(existsSync("src/routes/admin/b2b-companies.tsx"), false);
  assert.equal(existsSync("src/lib/admin-b2b.functions.ts"), false);
});

test("access decision never reads the saved approved status", () => {
  const src = readFileSync("src/lib/b2b.functions.ts", "utf8");
  assert.ok(!/eq\("status",\s*"approved"\)/.test(src));
});

test("registration never calls Shopify company mutations", () => {
  const src = readFileSync("src/lib/business-registration.functions.ts", "utf8");
  assert.ok(!/companyCreate|companyAssignCustomerAsContact|companyContactAssignRole|provisionShopifyCompany/.test(src));
});
