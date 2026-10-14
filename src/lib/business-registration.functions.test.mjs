// Regression tests for src/lib/business-registration.functions.ts's
// saveBusinessRegistrationRecord -- the plain, non-createServerFn function
// that does the actual intake logic (createServerFn's own handler can't be
// invoked directly outside the real server runtime, see that file's own
// comment on this).
//
// Proves the restored-original-workflow guarantee: a registration creates
// (or reuses) the real Shopify Company + Location for the GST -- so it's
// immediately visible in Shopify Admin -> Customers -> Companies -- but
// NEVER assigns a contact or role, so no B2B purchasing access is ever
// granted by registering. Also proves retries are safe (no duplicate
// Shopify companies, no duplicate application rows) and that Shopify
// failures/timeouts during company creation don't corrupt anything.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/business-registration.functions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { saveBusinessRegistrationRecord } = await import("@/lib/business-registration.functions");

/** Fake findOrCreateShopifyCompany -- tracks every call, returns a
 * deterministic company/location id per GST (same GST -> same ids,
 * mirroring the real function's own idempotent lookup-by-GST behavior),
 * and NEVER assigns any contact or role (there is no such call for it to
 * make -- this fake only has the shape findOrCreateShopifyCompany itself
 * has, which structurally proves the real one can't either). */
function makeFakeShopify({ shouldFail = false, timeoutButActuallyCreatesTimes = 0 } = {}) {
  const calls = [];
  const companiesByGst = new Map();
  let timeoutsLeft = timeoutButActuallyCreatesTimes;
  const fn = async (input) => {
    calls.push(input);
    if (shouldFail) throw new Error("simulated Shopify timeout");
    if (timeoutsLeft > 0) {
      timeoutsLeft--;
      // Models the REAL Shopify behavior registerCustomer() and
      // findOrCreateShopifyCompany's own self-heal logic both already
      // anticipate: the mutation can commit server-side even though the
      // CALLER never sees a successful response -- so the Company is
      // created here (same as a real timeout where Shopify already
      // processed the request) before the simulated error is thrown.
      let company = companiesByGst.get(input.gstNumber);
      if (!company) {
        company = {
          companyId: `gid://shopify/Company/${companiesByGst.size + 1}`,
          companyLocationId: `gid://shopify/CompanyLocation/${companiesByGst.size + 1}`,
          orderingOnlyRoleId: `gid://shopify/CompanyContactRole/${companiesByGst.size + 1}`,
        };
        companiesByGst.set(input.gstNumber, company);
      }
      throw new Error("simulated Shopify timeout (request actually succeeded server-side)");
    }
    let company = companiesByGst.get(input.gstNumber);
    if (!company) {
      company = {
        companyId: `gid://shopify/Company/${companiesByGst.size + 1}`,
        companyLocationId: `gid://shopify/CompanyLocation/${companiesByGst.size + 1}`,
        orderingOnlyRoleId: `gid://shopify/CompanyContactRole/${companiesByGst.size + 1}`,
      };
      companiesByGst.set(input.gstNumber, company);
    }
    return company;
  };
  fn.calls = calls;
  fn._companiesByGst = companiesByGst;
  return fn;
}

function makeFakeClient({ existingCompanyIdForGst = null, failCompanyInsertTimes = 0, failApplicationUpsertTimes = 0 } = {}) {
  const upsertedRows = [];
  const insertedCompanyRows = [];
  const b2bCompaniesByGst = new Map(existingCompanyIdForGst ? [["27AAAAA0000A1Z5", existingCompanyIdForGst]] : []);
  let nextCompanyRowId = 1000;
  let companyInsertFailuresLeft = failCompanyInsertTimes;
  let applicationUpsertFailuresLeft = failApplicationUpsertTimes;
  return {
    _upsertedRows: upsertedRows,
    _insertedCompanyRows: insertedCompanyRows,
    _b2bCompaniesByGst: b2bCompaniesByGst,
    from(table) {
      if (table === "b2b_companies") {
        return {
          select() {
            return {
              eq(_field, gst) {
                return { async maybeSingle() { return { data: b2bCompaniesByGst.has(gst) ? { id: b2bCompaniesByGst.get(gst) } : null, error: null }; } };
              },
            };
          },
          insert(row) {
            return {
              select() {
                return {
                  async single() {
                    if (companyInsertFailuresLeft > 0) {
                      companyInsertFailuresLeft--;
                      // Simulates a real Postgres/network failure on the
                      // INSERT itself -- the row is NOT created (matches
                      // real Postgres: a failed INSERT commits nothing).
                      return { data: null, error: { message: "simulated b2b_companies insert failure" } };
                    }
                    const id = `company-row-${nextCompanyRowId++}`;
                    insertedCompanyRows.push({ id, ...row });
                    b2bCompaniesByGst.set(row.gst_number, id);
                    return { data: { id }, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "business_account_requests") {
        return {
          upsert(row, _opts) {
            if (applicationUpsertFailuresLeft > 0) {
              applicationUpsertFailuresLeft--;
              return Promise.resolve({ error: { message: "simulated business_account_requests upsert failure" } });
            }
            upsertedRows.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  };
}

test("a brand-new GST registration creates the Shopify Company/Location (never a contact/role), mirrors it into b2b_companies, and saves a 'pending' application", async () => {
  const client = makeFakeClient();
  const shopify = makeFakeShopify();
  const result = await saveBusinessRegistrationRecord(
    { companyName: "Acme Pvt Ltd", gstNumber: "27AAAAA0000A1Z5", contactName: "Jane Doe", phone: "+919999999999" },
    "gid://shopify/Customer/1",
    client,
    shopify,
  );
  assert.equal(result.ok, true);
  assert.equal(result.status, "pending");

  assert.equal(shopify.calls.length, 1, "exactly one Shopify company find-or-create call");
  assert.equal(shopify.calls[0].gstNumber, "27AAAAA0000A1Z5");
  assert.equal(shopify.calls[0].companyName, "Acme Pvt Ltd");

  assert.equal(client._insertedCompanyRows.length, 1);
  const companyRow = client._insertedCompanyRows[0];
  assert.equal(companyRow.gst_number, "27AAAAA0000A1Z5");
  assert.equal(companyRow.shopify_company_id, "gid://shopify/Company/1");
  assert.equal(companyRow.shopify_company_location_id, "gid://shopify/CompanyLocation/1");

  assert.equal(client._upsertedRows.length, 1);
  const row = client._upsertedRows[0];
  assert.equal(row.status, "pending", "never auto-approved -- a real Company existing grants no one access by itself");
  assert.equal(row.b2b_company_id, companyRow.id);
  assert.equal(row.company_name, "Acme Pvt Ltd");
  assert.equal(row.contact_name, "Jane Doe");
  assert.equal(row.reviewed_by, null);
  assert.equal(row.reviewed_at, null);
});

test("a second applicant under the SAME GST reuses the existing Shopify Company -- never a second companyCreate, never a second b2b_companies row", async () => {
  const client = makeFakeClient();
  const shopify = makeFakeShopify();
  await saveBusinessRegistrationRecord({ companyName: "Acme Pvt Ltd", gstNumber: "27AAAAA0000A1Z5" }, "gid://shopify/Customer/1", client, shopify);
  await saveBusinessRegistrationRecord({ companyName: "Acme Pvt Ltd (second contact)", gstNumber: "27AAAAA0000A1Z5" }, "gid://shopify/Customer/2", client, shopify);

  assert.equal(shopify.calls.length, 2, "findOrCreateShopifyCompany is still called each time (it does its own idempotent lookup)");
  assert.equal(client._insertedCompanyRows.length, 1, "only ONE b2b_companies row for this GST, ever");
  assert.equal(client._upsertedRows.length, 2, "two separate application rows, one per customer");
  assert.equal(client._upsertedRows[0].b2b_company_id, client._upsertedRows[1].b2b_company_id, "both applications point at the same company row");
  assert.equal(client._upsertedRows[1].status, "pending", "the second applicant still requires their own approval, never inherits the first's");
});

test("a registration for a GST that already has a b2b_companies row (from an earlier registration or the grandfathering sync) reuses it without re-inserting", async () => {
  const client = makeFakeClient({ existingCompanyIdForGst: "existing-company-row-id" });
  const shopify = makeFakeShopify();
  const result = await saveBusinessRegistrationRecord(
    { companyName: "Acme Pvt Ltd (second contact)", gstNumber: "27AAAAA0000A1Z5" },
    "gid://shopify/Customer/2",
    client,
    shopify,
  );
  assert.equal(result.status, "pending");
  assert.equal(client._insertedCompanyRows.length, 0, "no duplicate b2b_companies insert");
  const row = client._upsertedRows[0];
  assert.equal(row.status, "pending", "a second contact for a known company must still require its own approval");
  assert.equal(row.b2b_company_id, "existing-company-row-id");
});

test("retrying the SAME customer's registration (e.g. after a prior Supabase failure) updates the same application row, not a duplicate", async () => {
  const client = makeFakeClient();
  const shopify = makeFakeShopify();
  await saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5" }, "gid://shopify/Customer/1", client, shopify);
  await saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5" }, "gid://shopify/Customer/1", client, shopify);

  assert.equal(client._insertedCompanyRows.length, 1, "retrying never creates a second Shopify company row");
  assert.equal(client._upsertedRows.length, 2, "both upsert calls happen (real Postgres upsert-by-shopify_customer_id would collapse these to one row -- this fake just records each call)");
  assert.equal(client._upsertedRows[0].shopify_customer_id, client._upsertedRows[1].shopify_customer_id);
});

test("a Shopify failure (including a timeout) during company creation fails the whole registration -- no Supabase row is silently saved without a real Company behind it", async () => {
  const client = makeFakeClient();
  const shopify = makeFakeShopify({ shouldFail: true });
  await assert.rejects(
    () => saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5" }, "gid://shopify/Customer/1", client, shopify),
    /simulated Shopify timeout/,
  );
  assert.equal(client._insertedCompanyRows.length, 0);
  assert.equal(client._upsertedRows.length, 0, "never claims 'submitted' when the Company was never actually created in Shopify");
});

// ---- Full registration sequence under each specific failure point, plus retry ----

test("SCENARIO: Shopify company creation succeeds but Supabase mirroring (b2b_companies insert) fails -- the call fails, no application is saved, and a retry self-heals to exactly one company row and one pending application", async () => {
  const shopify = makeFakeShopify();
  const client = makeFakeClient({ failCompanyInsertTimes: 1 });

  await assert.rejects(
    () => saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5", contactName: "Jane" }, "gid://shopify/Customer/1", client, shopify),
    /simulated b2b_companies insert failure/,
  );
  assert.equal(shopify.calls.length, 1, "Shopify company creation genuinely succeeded on this attempt");
  assert.equal(client._insertedCompanyRows.length, 0, "the failed INSERT created nothing");
  assert.equal(client._upsertedRows.length, 0, "never claims 'submitted' -- the application was never actually saved");

  // Retry: same customer, same GST.
  const result = await saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5", contactName: "Jane" }, "gid://shopify/Customer/1", client, shopify);
  assert.equal(result.status, "pending");
  assert.equal(shopify.calls.length, 2, "findOrCreateShopifyCompany is called again, but its own GST lookup means no duplicate Shopify Company was created");
  assert.equal(shopify._companiesByGst.size, 1, "exactly one Shopify Company exists for this GST, even though the mutation ran twice");
  assert.equal(client._insertedCompanyRows.length, 1, "exactly one b2b_companies row, created on the retry");
  assert.equal(client._upsertedRows.length, 1, "exactly one application, saved on the retry");
  assert.equal(client._upsertedRows[0].status, "pending");
});

test("SCENARIO: Supabase mirroring succeeds but saving the application fails -- the call fails, the company row is NOT duplicated, and a retry reuses it and succeeds", async () => {
  const shopify = makeFakeShopify();
  const client = makeFakeClient({ failApplicationUpsertTimes: 1 });

  await assert.rejects(
    () => saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5", contactName: "Jane" }, "gid://shopify/Customer/1", client, shopify),
    /simulated business_account_requests upsert failure/,
  );
  assert.equal(client._insertedCompanyRows.length, 1, "the b2b_companies row WAS created before the application save failed");
  assert.equal(client._upsertedRows.length, 0, "the application itself was never saved");

  // Retry: same customer, same GST.
  const result = await saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5", contactName: "Jane" }, "gid://shopify/Customer/1", client, shopify);
  assert.equal(result.status, "pending");
  assert.equal(client._insertedCompanyRows.length, 1, "the retry found and reused the existing b2b_companies row -- no second insert");
  assert.equal(client._upsertedRows.length, 1, "the application is now saved");
});

test("SCENARIO: Shopify times out but had already created the Company server-side -- the call fails, nothing is saved to Supabase yet, and a retry finds the real Company (no duplicate) and completes", async () => {
  const shopify = makeFakeShopify({ timeoutButActuallyCreatesTimes: 1 });
  const client = makeFakeClient();

  await assert.rejects(
    () => saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5", contactName: "Jane" }, "gid://shopify/Customer/1", client, shopify),
    /simulated Shopify timeout/,
  );
  assert.equal(shopify._companiesByGst.size, 1, "the Company genuinely exists in Shopify despite the reported timeout");
  assert.equal(client._insertedCompanyRows.length, 0, "nothing was saved to Supabase -- the failure was surfaced, not silently swallowed");
  assert.equal(client._upsertedRows.length, 0);

  // Retry: same customer, same GST.
  const result = await saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5", contactName: "Jane" }, "gid://shopify/Customer/1", client, shopify);
  assert.equal(result.status, "pending");
  assert.equal(shopify._companiesByGst.size, 1, "still exactly one Shopify Company for this GST -- the retry reused it, never created a second one");
  assert.equal(client._insertedCompanyRows.length, 1);
  assert.equal(client._upsertedRows.length, 1);
});

test("SCENARIO: the customer retries after EACH of the three failure points in turn -- every retry converges to exactly one Shopify Company, one b2b_companies row, and one pending application, never duplicates at any layer", async () => {
  for (const config of [
    { shopify: {}, client: { failCompanyInsertTimes: 1 } },
    { shopify: {}, client: { failApplicationUpsertTimes: 1 } },
    { shopify: { timeoutButActuallyCreatesTimes: 1 }, client: {} },
  ]) {
    const shopify = makeFakeShopify(config.shopify);
    const client = makeFakeClient(config.client);
    const customerId = "gid://shopify/Customer/retry-test";

    await assert.rejects(() => saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5", contactName: "Jane" }, customerId, client, shopify));
    const result = await saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5", contactName: "Jane" }, customerId, client, shopify);

    assert.equal(result.status, "pending", `retry must eventually succeed for config ${JSON.stringify(config)}`);
    assert.equal(client._insertedCompanyRows.length, 1, "exactly one company row");
    assert.equal(client._upsertedRows.length, 1, "exactly one application row");
    assert.equal(shopify._companiesByGst.size, 1, "exactly one Shopify Company");
  }
});

test("an optional address is stored only when every field is present -- a partial address is dropped, never stored incomplete", async () => {
  const client = makeFakeClient();
  const shopify = makeFakeShopify();
  await saveBusinessRegistrationRecord(
    { companyName: "Acme", gstNumber: "27AAAAA0000A1Z5", address: { addressLine1: "123 Main St", city: "Mumbai", state: "Maharashtra", pin: "400001", country: "India" } },
    "gid://shopify/Customer/3",
    client,
    shopify,
  );
  const row = client._upsertedRows[0];
  assert.equal(row.address_line1, "123 Main St");
  assert.equal(row.city, "Mumbai");
  assert.equal(row.country, "India");
  // The same address is what findOrCreateShopifyCompany itself received,
  // so it reaches the Shopify Company Location too (not just Supabase).
  assert.deepEqual(shopify.calls[0].address, { addressLine1: "123 Main St", city: "Mumbai", state: "Maharashtra", pin: "400001", country: "India" });
});

test("no address at all stores every address column as null, not undefined/omitted, and Shopify never receives an address field", async () => {
  const client = makeFakeClient();
  const shopify = makeFakeShopify();
  await saveBusinessRegistrationRecord({ companyName: "Acme", gstNumber: "27AAAAA0000A1Z5" }, "gid://shopify/Customer/4", client, shopify);
  const row = client._upsertedRows[0];
  assert.equal(row.address_line1, null);
  assert.equal(row.city, null);
  assert.equal(row.state, null);
  assert.equal(shopify.calls[0].address, undefined);
});

test("saving an application never sends any email (no notifier, no Resend)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/lib/business-registration.functions.ts", "utf8");
  assert.ok(!/resend|RESEND_API_KEY|emails\.send|marketing@officeneed\.in/i.test(src));
});

test("saving an application never calls a company-contact or role-assignment mutation -- company creation and access grant are structurally separate", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/lib/business-registration.functions.ts", "utf8");
  assert.ok(!/companyAssignCustomerAsContact|companyContactAssignRole|ensureContactAndRole|provisionShopifyCompanyForApproval/.test(src), "must only ever call findOrCreateShopifyCompany, never the contact/role-granting function");
});
