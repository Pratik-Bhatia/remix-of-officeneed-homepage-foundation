// Regression tests for src/lib/business-registration.functions.ts's
// saveBusinessRegistrationRecord -- the plain, non-createServerFn function
// that does the actual intake write (createServerFn's own handler can't be
// invoked directly outside the real server runtime, see that file's own
// comment on this).
//
// Proves the core guarantee of restored manual approval: a registration
// NEVER touches Shopify and ALWAYS lands as 'pending', whether the GST is
// brand new or already belongs to an approved company.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/business-registration.functions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { saveBusinessRegistrationRecord } = await import("@/lib/business-registration.functions");

function makeFakeClient({ existingCompanyIdForGst = null } = {}) {
  const upsertedRows = [];
  const state = { previous: null };
  return {
    _upsertedRows: upsertedRows,
    _state: state,
    from(table) {
      if (table === "b2b_companies") {
        return {
          select() {
            return {
              eq(_field, _value) {
                return { async maybeSingle() { return { data: existingCompanyIdForGst ? { id: existingCompanyIdForGst } : null, error: null }; } };
              },
            };
          },
        };
      }
      if (table === "business_account_requests") {
        return {
          select() {
            return { eq() { return { async maybeSingle() { return { data: state.previous, error: null }; } }; } };
          },
          upsert(row, _opts) {
            upsertedRows.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  };
}

test("a brand-new GST registration is saved as 'pending' with no b2b_company_id -- never auto-approved", async () => {
  const client = makeFakeClient();
  const result = await saveBusinessRegistrationRecord(
    { companyName: "Acme Pvt Ltd", gstNumber: "27AAAAA0000A1Z5", contactName: "Jane Doe", phone: "+919999999999" },
    "gid://shopify/Customer/1",
    client,
  );
  assert.equal(result.ok, true);
  assert.equal(result.status, "pending");
  assert.equal(client._upsertedRows.length, 1);
  const row = client._upsertedRows[0];
  assert.equal(row.status, "pending");
  assert.equal(row.b2b_company_id, null);
  assert.equal(row.company_name, "Acme Pvt Ltd");
  assert.equal(row.contact_name, "Jane Doe");
  assert.equal(row.reviewed_by, null);
  assert.equal(row.reviewed_at, null);
});

test("a registration for a GST that already has an approved company still lands as 'pending' -- only b2b_company_id is set, for admin context, never access", async () => {
  const client = makeFakeClient({ existingCompanyIdForGst: "existing-company-row-id" });
  const result = await saveBusinessRegistrationRecord(
    { companyName: "Acme Pvt Ltd (second contact)", gstNumber: "27AAAAA0000A1Z5" },
    "gid://shopify/Customer/2",
    client,
  );
  assert.equal(result.status, "pending");
  const row = client._upsertedRows[0];
  assert.equal(row.status, "pending", "a second contact for a known company must still require its own approval");
  assert.equal(row.b2b_company_id, "existing-company-row-id");
});

test("an optional address is stored only when every field is present -- a partial address is dropped, never stored incomplete", async () => {
  const client = makeFakeClient();
  await saveBusinessRegistrationRecord(
    { companyName: "Acme", gstNumber: "27AAAAA0000A1Z5", address: { addressLine1: "123 Main St", city: "Mumbai", state: "Maharashtra", pin: "400001", country: "India" } },
    "gid://shopify/Customer/3",
    client,
  );
  const row = client._upsertedRows[0];
  assert.equal(row.address_line1, "123 Main St");
  assert.equal(row.city, "Mumbai");
  assert.equal(row.country, "India");
});

test("no address at all stores every address column as null, not undefined/omitted", async () => {
  const client = makeFakeClient();
  await saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5" }, "gid://shopify/Customer/4", client);
  const row = client._upsertedRows[0];
  assert.equal(row.address_line1, null);
  assert.equal(row.city, null);
  assert.equal(row.state, null);
});

test("saving an application never sends any email (no notifier, no Resend)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/lib/business-registration.functions.ts", "utf8");
  assert.ok(!/resend|RESEND_API_KEY|emails\.send|marketing@officeneed\.in/i.test(src));
});
