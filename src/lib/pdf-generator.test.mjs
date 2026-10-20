// Regression: Needle enquiries with no selected products crashed PDF
// generation ("reading 'finalY'"), which stopped every confirmation email.
// Run with: npx tsx --test src/lib/pdf-generator.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateEnquiryPDF } from "./pdf-generator";

const base = {
  enquiryId: "ON-AI-TEST0001",
  date: "20 October 2026",
  customer: { name: "Test", email: "test@example.com" },
  requirements: { purpose: "Gifting", quantity: 10 },
};

test("PDF is generated when the enquiry has no products", async () => {
  const pdf = await generateEnquiryPDF({ ...base, products: [] });
  assert.ok(pdf.length > 1000);
});

test("PDF is generated when the enquiry has products", async () => {
  const pdf = await generateEnquiryPDF({
    ...base,
    products: [{ name: "Pen", category: "Stationery", quantity: 10, unitPrice: 100, unitPriceStr: "₹100" }],
  });
  assert.ok(pdf.length > 1000);
});
