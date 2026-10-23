// Regression test for computeQuoteEmailStatus (src/lib/corporate-quotes.functions.ts),
// extracted as a plain pure function for the same reason as
// enquiries.functions.test.mjs's computeEnquiryEmailStatus test --
// submitCorporateQuote itself is a createServerFn handler and can't run
// under node:test. Before this fix, submitCorporateQuote never even
// checked sendInternalHtmlEmail/sendCustomerHtmlEmail's boolean returns;
// this function is what makes that outcome visible and testable.
//
// Run with: npx tsx --test src/lib/corporate-quotes.functions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQuoteEmailStatus } from "./corporate-quotes.functions";

test("both emails sent -> 'accepted'", () => {
  assert.equal(computeQuoteEmailStatus(true, true), "accepted");
});

test("only the internal email sent -> 'partial'", () => {
  assert.equal(computeQuoteEmailStatus(true, false), "partial");
});

test("only the customer email sent -> 'partial'", () => {
  assert.equal(computeQuoteEmailStatus(false, true), "partial");
});

test("neither email sent (e.g. missing RESEND_API_KEY, both calls return false) -> 'provider_error', no longer silently invisible", () => {
  assert.equal(computeQuoteEmailStatus(false, false), "provider_error");
});

import { submitQuoteSchema } from "./corporate-quotes.functions";

test("a gift-set quote keeps each component's own printing method (not stripped, not shared)", () => {
  const parsed = submitQuoteSchema.parse({
    fullName: "A", company: "B", email: "a@b.co", phone: "1", quantity: 30, location: "Pune",
    printingMethod: "A5 Notebook Diary: UV Printing; Ball Pen: Laser Engraving",
    product: { id: "x", name: "Gift Set" },
    giftSetCustomizations: [
      { component: "A5 Notebook Diary", customized: true, printingMethod: "UV Printing" },
      { component: "Ball Pen", customized: true, printingMethod: "Laser Engraving" },
    ],
  });
  assert.deepEqual(parsed.giftSetCustomizations.map((c) => c.printingMethod), ["UV Printing", "Laser Engraving"]);
});
