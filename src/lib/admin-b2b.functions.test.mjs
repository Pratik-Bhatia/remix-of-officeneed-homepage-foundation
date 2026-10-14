// Regression tests for src/lib/admin-b2b.functions.ts's plain, non-
// createServerFn *Impl functions -- createServerFn's own handler can't be
// invoked directly outside the real server runtime (same reason every
// other *.functions.test.mjs file in this project uses this pattern).
//
// Covers the required test matrix for restored manual B2B approval:
// approving assigns the chosen payment terms exactly once; rejecting
// never touches Shopify; Pay Now vs Pay Later are mutually exclusive;
// two different companies' terms never cross-contaminate; admin auth is
// actually enforced.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/admin-b2b.functions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  assertAdmin,
  listB2BApplicationsImpl,
  approveB2BApplicationImpl,
  rejectB2BApplicationImpl,
  updateB2BCompanyPaymentTermsImpl,
  validatePaymentTermsChoice,
} = await import("@/lib/admin-b2b.functions");

// ---- A minimal in-memory fake Supabase-like client ----
// Supports exactly the chain shapes admin-b2b.functions.ts actually uses:
// .from(t).select(...).eq(...).maybeSingle() / .order(...) (awaited
// directly for a list), .insert(...).select(...).single(), and
// .update(...).eq(...). Good enough to prove the real logic's branching,
// not a Postgrest reimplementation.
function makeFakeSupabase(seed = {}) {
  const tables = { user_roles: [], business_account_requests: [], b2b_companies: [], ...seed };
  let nextId = 1000;

  function query(table) {
    const filters = [];
    let mode = null; // "insert" | "update"
    let payload = null;

    const applyFilters = (rows) => rows.filter((row) => filters.every(([f, v]) => row[f] === v));

    const finish = async (single) => {
      if (mode === "insert") {
        const row = { id: `generated-${nextId++}`, ...payload };
        tables[table].push(row);
        return { data: single ? row : [row], error: null };
      }
      if (mode === "update") {
        const matches = applyFilters(tables[table]);
        for (const row of matches) Object.assign(row, payload);
        return { data: null, error: null };
      }
      const matches = applyFilters(tables[table]);
      return single ? { data: matches[0] ?? null, error: null } : { data: matches, error: null };
    };

    const builder = {
      select() { return builder; },
      order() { return builder; },
      eq(field, value) { filters.push([field, value]); return builder; },
      insert(row) { mode = "insert"; payload = row; return builder; },
      update(patch) { mode = "update"; payload = patch; return builder; },
      maybeSingle() { return finish(true); },
      single() { return finish(true); },
      then(resolve, reject) { finish(false).then(resolve, reject); },
    };
    return builder;
  }

  return { from: (table) => query(table), _tables: tables };
}

const ADMIN_CONTEXT = (supabase) => ({ supabase, userId: "admin-user-1" });

test("assertAdmin rejects a signed-in user who has no admin role row", async () => {
  const supabase = makeFakeSupabase({ user_roles: [] });
  await assert.rejects(() => assertAdmin(ADMIN_CONTEXT(supabase)), /Forbidden/);
});

test("assertAdmin allows a user with an admin role row", async () => {
  const supabase = makeFakeSupabase({ user_roles: [{ user_id: "admin-user-1", role: "admin" }] });
  await assert.doesNotReject(() => assertAdmin(ADMIN_CONTEXT(supabase)));
});

test("validatePaymentTermsChoice requires a template id for pay_later, and forbids one for pay_now", () => {
  assert.throws(() => validatePaymentTermsChoice("pay_later", undefined), /template is required/);
  const payNow = validatePaymentTermsChoice("pay_now", "gid://shopify/PaymentTermsTemplate/4");
  assert.equal(payNow.paymentTermsTemplateId, null, "pay_now must never carry a template id through, even if one was sent");
  const payLater = validatePaymentTermsChoice("pay_later", "gid://shopify/PaymentTermsTemplate/4");
  assert.equal(payLater.paymentTermsTemplateId, "gid://shopify/PaymentTermsTemplate/4");
});

test("listB2BApplicationsImpl filters by status when given one", async () => {
  const supabase = makeFakeSupabase({
    user_roles: [{ user_id: "admin-user-1", role: "admin" }],
    business_account_requests: [
      { id: "r1", status: "pending", company_name: "A" },
      { id: "r2", status: "approved", company_name: "B" },
    ],
  });
  const pending = await listB2BApplicationsImpl({ status: "pending" }, ADMIN_CONTEXT(supabase));
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, "r1");
});

test("approving a NEW GST provisions Shopify exactly once and applies the chosen payment terms", async () => {
  const supabase = makeFakeSupabase({
    user_roles: [{ user_id: "admin-user-1", role: "admin" }],
    business_account_requests: [
      { id: "req-1", status: "pending", shopify_customer_id: "gid://shopify/Customer/1", company_name: "Acme", gst_number: "27AAAAA0000A1Z5", contact_name: "Jane", phone: null, b2b_company_id: null },
    ],
  });
  let provisionCalls = 0;
  let appliedTerms = null;
  const deps = {
    provision: async (input) => {
      provisionCalls++;
      assert.equal(input.gstNumber, "27AAAAA0000A1Z5");
      return { companyId: "gid://shopify/Company/1", companyLocationId: "gid://shopify/CompanyLocation/1" };
    },
    applyTerms: async (locationId, templateId) => {
      appliedTerms = { locationId, templateId };
    },
  };
  const result = await approveB2BApplicationImpl(
    { requestId: "req-1", paymentTerms: "pay_later", paymentTermsTemplateId: "gid://shopify/PaymentTermsTemplate/4", paymentTermsTemplateName: "Net 30" },
    ADMIN_CONTEXT(supabase),
    deps,
  );
  assert.equal(result.ok, true);
  assert.equal(provisionCalls, 1);
  assert.deepEqual(appliedTerms, { locationId: "gid://shopify/CompanyLocation/1", templateId: "gid://shopify/PaymentTermsTemplate/4" });

  const company = supabase._tables.b2b_companies.find((c) => c.gst_number === "27AAAAA0000A1Z5");
  assert.ok(company, "a b2b_companies row must be created for a new GST");
  assert.equal(company.payment_terms, "pay_later");
  assert.equal(company.payment_terms_template_name, "Net 30");

  const request = supabase._tables.business_account_requests.find((r) => r.id === "req-1");
  assert.equal(request.status, "approved");
  assert.equal(request.b2b_company_id, company.id);
  assert.equal(request.reviewed_by, "admin-user-1");
});

test("approving a Pay Now company never carries a payment terms template through to Shopify", async () => {
  const supabase = makeFakeSupabase({
    user_roles: [{ user_id: "admin-user-1", role: "admin" }],
    business_account_requests: [
      { id: "req-2", status: "pending", shopify_customer_id: "gid://shopify/Customer/2", company_name: "Beta", gst_number: "29BBBBB0000B1Z5", contact_name: "Bob", phone: null, b2b_company_id: null },
    ],
  });
  let appliedTemplateId = "not-called";
  const deps = {
    provision: async () => ({ companyId: "gid://shopify/Company/2", companyLocationId: "gid://shopify/CompanyLocation/2" }),
    applyTerms: async (_locationId, templateId) => { appliedTemplateId = templateId; },
  };
  await approveB2BApplicationImpl({ requestId: "req-2", paymentTerms: "pay_now", paymentTermsTemplateId: null, paymentTermsTemplateName: null }, ADMIN_CONTEXT(supabase), deps);
  assert.equal(appliedTemplateId, null, "a pay_now company must never have a payment terms template applied");
  const company = supabase._tables.b2b_companies.find((c) => c.gst_number === "29BBBBB0000B1Z5");
  assert.equal(company.payment_terms, "pay_now");
});

test("approving a SECOND contact for an already-known GST reuses the existing b2b_companies row -- never creates a duplicate", async () => {
  const supabase = makeFakeSupabase({
    user_roles: [{ user_id: "admin-user-1", role: "admin" }],
    b2b_companies: [{ id: "company-existing", gst_number: "27AAAAA0000A1Z5", payment_terms: "pay_now" }],
    business_account_requests: [
      { id: "req-3", status: "pending", shopify_customer_id: "gid://shopify/Customer/3", company_name: "Acme (2nd contact)", gst_number: "27AAAAA0000A1Z5", contact_name: "Second Person", phone: null, b2b_company_id: "company-existing" },
    ],
  });
  const deps = {
    provision: async () => ({ companyId: "gid://shopify/Company/1", companyLocationId: "gid://shopify/CompanyLocation/1" }),
    applyTerms: async () => {},
  };
  await approveB2BApplicationImpl({ requestId: "req-3", paymentTerms: "pay_now", paymentTermsTemplateId: null, paymentTermsTemplateName: null }, ADMIN_CONTEXT(supabase), deps);
  assert.equal(supabase._tables.b2b_companies.length, 1, "no second b2b_companies row for the same GST");
  const request = supabase._tables.business_account_requests.find((r) => r.id === "req-3");
  assert.equal(request.b2b_company_id, "company-existing");
});

test("approving an already-approved application is idempotent -- provisioning is never called again", async () => {
  const supabase = makeFakeSupabase({
    user_roles: [{ user_id: "admin-user-1", role: "admin" }],
    business_account_requests: [{ id: "req-4", status: "approved", b2b_company_id: "company-already-done" }],
  });
  let provisionCalls = 0;
  const deps = { provision: async () => { provisionCalls++; return { companyId: "x", companyLocationId: "y" }; }, applyTerms: async () => {} };
  const result = await approveB2BApplicationImpl({ requestId: "req-4", paymentTerms: "pay_now", paymentTermsTemplateId: null, paymentTermsTemplateName: null }, ADMIN_CONTEXT(supabase), deps);
  assert.equal(provisionCalls, 0);
  assert.equal(result.companyId, "company-already-done");
});

test("rejecting an application makes no Shopify call and records the reviewer/reason, without ever creating a company row", async () => {
  const supabase = makeFakeSupabase({
    user_roles: [{ user_id: "admin-user-1", role: "admin" }],
    business_account_requests: [{ id: "req-5", status: "pending", gst_number: "27CCCCC0000C1Z5" }],
  });
  const result = await rejectB2BApplicationImpl({ requestId: "req-5", reason: "Invalid GST documentation" }, ADMIN_CONTEXT(supabase));
  assert.equal(result.ok, true);
  const request = supabase._tables.business_account_requests.find((r) => r.id === "req-5");
  assert.equal(request.status, "rejected");
  assert.equal(request.rejection_reason, "Invalid GST documentation");
  assert.equal(request.reviewed_by, "admin-user-1");
  assert.equal(supabase._tables.b2b_companies.length, 0, "rejecting must never create a b2b_companies row");
});

test("a non-admin cannot approve or reject -- both reject before touching any data", async () => {
  const supabase = makeFakeSupabase({
    user_roles: [], // not an admin
    business_account_requests: [{ id: "req-6", status: "pending", gst_number: "27DDDDD0000D1Z5" }],
  });
  const deps = { provision: async () => { throw new Error("must not be called"); }, applyTerms: async () => { throw new Error("must not be called"); } };
  await assert.rejects(() => approveB2BApplicationImpl({ requestId: "req-6", paymentTerms: "pay_now", paymentTermsTemplateId: null, paymentTermsTemplateName: null }, ADMIN_CONTEXT(supabase), deps), /Forbidden/);
  await assert.rejects(() => rejectB2BApplicationImpl({ requestId: "req-6", reason: null }, ADMIN_CONTEXT(supabase)), /Forbidden/);
  const request = supabase._tables.business_account_requests.find((r) => r.id === "req-6");
  assert.equal(request.status, "pending", "a non-admin's call must never change the application's status");
});

test("two different companies' payment terms never cross-contaminate", async () => {
  const supabase = makeFakeSupabase({
    user_roles: [{ user_id: "admin-user-1", role: "admin" }],
    b2b_companies: [
      { id: "company-a", shopify_company_location_id: "loc-a", payment_terms: "pay_now" },
      { id: "company-b", shopify_company_location_id: "loc-b", payment_terms: "pay_now" },
    ],
  });
  const applied = [];
  const deps = { applyTerms: async (locationId, templateId) => applied.push({ locationId, templateId }) };
  await updateB2BCompanyPaymentTermsImpl({ companyId: "company-a", paymentTerms: "pay_later", paymentTermsTemplateId: "net-30", paymentTermsTemplateName: "Net 30" }, ADMIN_CONTEXT(supabase), deps);

  const companyA = supabase._tables.b2b_companies.find((c) => c.id === "company-a");
  const companyB = supabase._tables.b2b_companies.find((c) => c.id === "company-b");
  assert.equal(companyA.payment_terms, "pay_later");
  assert.equal(companyB.payment_terms, "pay_now", "updating company A must never change company B's terms");
  assert.equal(applied.length, 1);
  assert.equal(applied[0].locationId, "loc-a", "the Shopify mutation must target company A's own location, never company B's");
});
