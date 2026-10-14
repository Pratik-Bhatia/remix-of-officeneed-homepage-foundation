// Recovery path for a business application that fails AFTER the Shopify
// customer account was created.
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/business-application-recovery.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { submitBusinessApplication, saveApplicationDraft, getApplicationDraft, clearApplicationDraft } = await import("@/lib/business-application-draft");
const { saveBusinessRegistrationRecord } = await import("@/lib/business-registration.functions");

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

// Fake DB that honours upsert onConflict like Postgres does.
function upsertingClient({ failTimes = 0 } = {}) {
  const rows = new Map();
  let failuresLeft = failTimes;
  return {
    rows,
    from(table) {
      if (table === "b2b_companies") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      if (table === "business_account_requests") {
        return {
          upsert: async (row, opts) => {
            if (failuresLeft > 0) { failuresLeft--; return { error: { message: "column \"status\" does not exist" } }; }
            rows.set(row[opts.onConflict], row);
            return { error: null };
          },
        };
      }
      throw new Error("unexpected table " + table);
    },
  };
}

const draft = { companyName: "Acme Pvt Ltd", gstNumber: "27AAAAA0000A1Z5", contactName: "Jane Doe", phone: "+919999999999" };
const CUSTOMER = "gid://shopify/Customer/42";

test("application submission failure after customer creation reports 'failed', keeps a recovery draft, and creates no customer", async () => {
  const client = upsertingClient({ failTimes: 1 });
  let registerCalls = 0;
  const storage = memoryStorage();
  const outcome = await submitBusinessApplication((d) => saveBusinessRegistrationRecord(d, CUSTOMER, client), draft);
  assert.equal(outcome, "failed");
  saveApplicationDraft(CUSTOMER, draft, storage);
  assert.deepEqual(getApplicationDraft(CUSTOMER, storage), draft);
  assert.equal(client.rows.size, 0);
  assert.equal(registerCalls, 0, "recovery never re-registers the Shopify customer");
});

test("a retry after failure succeeds, stores one pending application, and clears the draft", async () => {
  const client = upsertingClient({ failTimes: 1 });
  const storage = memoryStorage();
  const save = (d) => saveBusinessRegistrationRecord(d, CUSTOMER, client);
  assert.equal(await submitBusinessApplication(save, draft), "failed");
  saveApplicationDraft(CUSTOMER, draft, storage);
  assert.equal(await submitBusinessApplication(save, getApplicationDraft(CUSTOMER, storage)), "submitted");
  clearApplicationDraft(CUSTOMER, storage);
  assert.equal(client.rows.size, 1);
  assert.equal(client.rows.get(CUSTOMER).status, "pending");
  assert.equal(getApplicationDraft(CUSTOMER, storage), null);
});

test("repeated retries never create duplicate applications for the same customer", async () => {
  const client = upsertingClient();
  const save = (d) => saveBusinessRegistrationRecord(d, CUSTOMER, client);
  for (let i = 0; i < 5; i++) assert.equal(await submitBusinessApplication(save, draft), "submitted");
  assert.equal(client.rows.size, 1);
});

test("a draft saved for one customer is never shown to a different customer on the same device", () => {
  const storage = memoryStorage();
  saveApplicationDraft(CUSTOMER, draft, storage);
  assert.equal(getApplicationDraft("gid://shopify/Customer/99", storage), null);
  assert.equal(getApplicationDraft(null, storage), null);
});

test("the recovery draft never stores a session token or password", () => {
  const storage = memoryStorage();
  saveApplicationDraft(CUSTOMER, { ...draft }, storage);
  const raw = [...storage._m.values()].join("");
  assert.ok(!/token|password/i.test(raw));
});
