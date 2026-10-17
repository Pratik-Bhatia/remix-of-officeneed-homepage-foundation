// Regression test for computeEnquiryEmailStatus and resolveEmailResendPlan
// (src/lib/enquiries.functions.ts), both extracted as plain pure functions
// so they're testable without a real createServerFn runtime (submitEnquiry
// itself, like every createServerFn handler in this codebase, can't run
// under node:test -- these are the pieces of its email-retry logic that
// can be verified directly).
//
// Run with: npx tsx --test src/lib/enquiries.functions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEnquiryEmailStatus, resolveEmailResendPlan } from "./enquiries.functions";

test("both emails sent -> 'accepted'", () => {
  assert.equal(computeEnquiryEmailStatus(true, true, true), "accepted");
});

test("only the customer email sent -> 'partial'", () => {
  assert.equal(computeEnquiryEmailStatus(true, false, true), "partial");
});

test("only the internal email sent -> 'partial'", () => {
  assert.equal(computeEnquiryEmailStatus(false, true, true), "partial");
});

test("neither email sent (both Resend calls returned false) -> 'provider_error'", () => {
  assert.equal(computeEnquiryEmailStatus(false, false, true), "provider_error");
});

test("PDF generation was never attempted/succeeded -> 'not_attempted', regardless of the (unreachable) email flags", () => {
  assert.equal(computeEnquiryEmailStatus(false, false, false), "not_attempted");
  assert.equal(computeEnquiryEmailStatus(true, true, false), "not_attempted");
});

// --- resolveEmailResendPlan: every partial-success combination ---

test("resolveEmailResendPlan: both emails already accepted -> skip both", () => {
  assert.deepEqual(
    resolveEmailResendPlan({ customer_email_sent: true, internal_email_sent: true }),
    { skipCustomerEmail: true, skipInternalEmail: true },
  );
});

test("resolveEmailResendPlan: only the customer email was already accepted -> skip only that one, still resend internal", () => {
  assert.deepEqual(
    resolveEmailResendPlan({ customer_email_sent: true, internal_email_sent: false }),
    { skipCustomerEmail: true, skipInternalEmail: false },
  );
});

test("resolveEmailResendPlan: only the internal email was already accepted -> skip only that one, still resend customer", () => {
  assert.deepEqual(
    resolveEmailResendPlan({ customer_email_sent: false, internal_email_sent: true }),
    { skipCustomerEmail: false, skipInternalEmail: true },
  );
});

test("resolveEmailResendPlan: neither was previously accepted -> resend both", () => {
  assert.deepEqual(
    resolveEmailResendPlan({ customer_email_sent: false, internal_email_sent: false }),
    { skipCustomerEmail: false, skipInternalEmail: false },
  );
});

test("resolveEmailResendPlan: a row with null/undefined flags (e.g. an old row predating this column) -> resend both, never crashes", () => {
  assert.deepEqual(
    resolveEmailResendPlan({ customer_email_sent: null, internal_email_sent: undefined }),
    { skipCustomerEmail: false, skipInternalEmail: false },
  );
});

test("resolveEmailResendPlan: no row found / lookup failed (null or undefined) -> resend both, the safe default", () => {
  assert.deepEqual(resolveEmailResendPlan(null), { skipCustomerEmail: false, skipInternalEmail: false });
  assert.deepEqual(resolveEmailResendPlan(undefined), { skipCustomerEmail: false, skipInternalEmail: false });
});
