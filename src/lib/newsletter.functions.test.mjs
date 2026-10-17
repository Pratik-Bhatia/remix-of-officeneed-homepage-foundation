// Regression test for subscribeEmail (src/lib/newsletter.functions.ts) --
// the plain, injectable core of subscribeToNewsletter, tested the same
// "fake Supabase client object" way business-registration.functions.test.mjs
// tests saveBusinessRegistrationRecord.
//
// Run with: npx tsx --test src/lib/newsletter.functions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { subscribeEmail } from "./newsletter.functions";

function fakeClient({ existingEmails = new Set() } = {}) {
  const upserts = [];
  return {
    upserts,
    client: {
      from(table) {
        assert.equal(table, "newsletter_subscribers");
        return {
          upsert(row, _opts) {
            upserts.push(row);
            const alreadyExisted = existingEmails.has(row.email);
            if (!alreadyExisted) existingEmails.add(row.email);
            return {
              select() {
                return {
                  async maybeSingle() {
                    // ignoreDuplicates: true -> Postgres/PostgREST returns
                    // no row for a pre-existing email, a real row for a
                    // new one -- modeled exactly that way here.
                    return { data: alreadyExisted ? null : { id: "new-row-id" }, error: null };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

test("a brand-new email subscribes and is not reported as a duplicate", async () => {
  const { client, upserts } = fakeClient();
  const result = await subscribeEmail("new@example.com", client);
  assert.deepEqual(result, { ok: true, alreadySubscribed: false });
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].email, "new@example.com");
});

test("a duplicate email returns alreadySubscribed: true and writes no new row", async () => {
  const { client } = fakeClient({ existingEmails: new Set(["existing@example.com"]) });
  const result = await subscribeEmail("existing@example.com", client);
  assert.deepEqual(result, { ok: true, alreadySubscribed: true });
});

test("email is normalized (trimmed + lowercased) before checking for a duplicate", async () => {
  const { client } = fakeClient({ existingEmails: new Set(["existing@example.com"]) });
  const result = await subscribeEmail("  Existing@Example.com  ", client);
  assert.deepEqual(result, { ok: true, alreadySubscribed: true }, "a case/whitespace variant of an existing subscriber must not create a second row");
});

test("a malformed email is rejected before ever touching Supabase", async () => {
  const { client, upserts } = fakeClient();
  const result = await subscribeEmail("not-an-email", client);
  assert.equal(result.ok, false);
  assert.equal(upserts.length, 0, "an invalid email must never reach the database");
});

test("a Supabase error surfaces as a generic, honest failure -- never the raw DB error", async () => {
  const client = {
    from() {
      return {
        upsert() {
          return { select() { return { async maybeSingle() { return { data: null, error: { message: "connection refused" } }; } }; } };
        },
      };
    },
  };
  const result = await subscribeEmail("new@example.com", client);
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.error, /connection refused/);
});
