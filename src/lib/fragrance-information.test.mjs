import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFragranceDescription, resolveFragranceInformation } from "./fragrance-information.ts";

const intro = "A rich fragrance with a sculptural bottle.";
const markdown = `${intro}

**Product Details**
- **Origin:** France
- **Fragrance Family:** Woody Fruity Leathery
- **Concentration:** Parfum
- **Size:** 100 ML
- **Gender:** Men / Pour Homme

**Fragrance Notes**
- **Top Notes:** Raspberry, Green Mandarin, Bergamot
- **Heart Notes:** Cardamom, Lavender, Clary Sage
- **Base Notes:** Leather, Wolfwood, Vetiver

**Overall Character:** Rich and layered.

**Best For:** Evening occasions.`;
const expectedDetails = [
  { label: "Origin", value: "France" },
  { label: "Fragrance Family", value: "Woody Fruity Leathery" },
  { label: "Concentration", value: "Parfum" },
  { label: "Size", value: "100 ML" },
  { label: "Gender", value: "Men / Pour Homme" },
];
const expectedNotes = {
  top: "Raspberry, Green Mandarin, Bergamot",
  heart: "Cardamom, Lavender, Clary Sage",
  base: "Leather, Wolfwood, Vetiver",
};

test("description-only Markdown extracts the supplied Azzaro values without product-specific logic", () => {
  const result = resolveFragranceInformation({ description: markdown });
  assert.deepEqual(result.specifications, expectedDetails);
  assert.deepEqual(result.fragranceNotes, expectedNotes);
  assert.match(result.descriptionHtml, /sculptural bottle/);
  assert.match(result.descriptionHtml, /Overall Character/);
  assert.match(result.descriptionHtml, /Best For/);
  assert.doesNotMatch(result.descriptionHtml, /France|Raspberry|Wolfwood|Product Details|Fragrance Notes/);
});

test("complete dedicated metafields work without a description or structured data", () => {
  const data = { origin: "France", fragrance_family: "Woody Fruity Leathery", concentration: "Parfum", size: "100 ML", gender: "Men / Pour Homme", top_notes: JSON.stringify(["Raspberry", "Green Mandarin", "Bergamot"]), heart_notes: expectedNotes.heart, base_notes: expectedNotes.base };
  const result = resolveFragranceInformation({ description: "" }, (ns, key) => ns === "product_fragrance" ? data[key] : undefined);
  assert.deepEqual(result.specifications, expectedDetails);
  assert.deepEqual(result.fragranceNotes, expectedNotes);
});

test("each populated metafield wins, then structured data, then description without duplicate rows", () => {
  const result = resolveFragranceInformation({ description: markdown, specifications: [{ label: "Origin", value: "Italy" }, { label: "Size", value: "50 ML" }], fragranceNotes: { top: "Rose" } }, (ns, key) => ns === "custom" && key === "origin" ? "Spain" : ns === "custom" && key === "heart_notes" ? "Jasmine" : undefined);
  assert.deepEqual(result.specifications.filter((spec) => spec.label === "Origin"), [{ label: "Origin", value: "Spain" }]);
  assert.equal(result.specifications.find((spec) => spec.label === "Size")?.value, "50 ML");
  assert.deepEqual(result.fragranceNotes, { top: "Rose", heart: "Jasmine", base: expectedNotes.base });
  assert.doesNotMatch(result.descriptionHtml, /France|Raspberry/);
});

test("HTML headings, nested bold labels, paragraphs, lists and breaks retain unrelated formatting", () => {
  const html = '<p>Intro <em>formatted</em>.</p><h2>Product Details</h2><ul><li><p><strong><span>Origin:</span></strong> France</p></li><li>Concentration: Parfum</li></ul><p><b>Fragrance Notes:</b></p><p><strong>Top Notes:</strong> Raspberry<br>Heart Notes: Lavender<br>Base Notes: Leather</p><h3>Overall Character</h3><ul><li>Warm <b>and layered</b>.</li></ul>';
  const result = resolveFragranceInformation({ description: "", descriptionHtml: html });
  assert.equal(result.specifications[0]?.value, "France");
  assert.deepEqual(result.fragranceNotes, { top: "Raspberry", heart: "Lavender", base: "Leather" });
  assert.match(result.descriptionHtml, /<em>formatted<\/em>/);
  assert.match(result.descriptionHtml, /<li>Warm <b>and layered<\/b>\.<\/li>/);
  assert.doesNotMatch(result.descriptionHtml, /Top Notes|France/);
});

test("incomplete data never invents rows or notes, empty metafields fall through", () => {
  const result = resolveFragranceInformation({ description: "Origin: France" }, () => "   ");
  assert.deepEqual(result.specifications, [{ label: "Origin", value: "France" }]);
  assert.deepEqual(result.fragranceNotes, { top: undefined, heart: undefined, base: undefined });
  const empty = resolveFragranceInformation({ description: "A fragrance." });
  assert.deepEqual(empty.specifications, []);
});

test("repeated conversion and sequential products never restore extracted content or stale notes", () => {
  const first = resolveFragranceInformation({ description: markdown });
  assert.deepEqual(resolveFragranceInformation({ description: markdown, ...first }), first);
  const second = resolveFragranceInformation({ description: "Top Notes: Citrus" });
  assert.deepEqual(second.fragranceNotes, { top: "Citrus", heart: undefined, base: undefined });
  assert.deepEqual(second.specifications, []);
  assert.deepEqual(resolveFragranceInformation({ description: markdown }), first);
});

test("unheaded labels and Overall Character in the same paragraph are retained appropriately", () => {
  const result = parseFragranceDescription("<p>Origin: France Concentration: Parfum</p><p>Base Notes: Leather Overall Character: Warm</p>");
  assert.equal(result.values.get("origin"), "France");
  assert.equal(result.values.get("concentration"), "Parfum");
  assert.equal(result.values.get("base_notes"), "Leather");
  assert.match(result.descriptionHtml, /Overall Character: Warm/);
});