// Standalone assertion-based tests for src/lib/search.ts, run with:
//   npx tsx scripts/search/test-search.mjs
// No test framework dependency is introduced (project has none); this
// mirrors the pattern already used by scripts/metafield-migration.
import assert from "node:assert/strict";
import {
  normalizeSearchText,
  tokenizeSearchQuery,
  calculateTextSimilarity,
  searchProducts,
  getSearchSuggestion,
  runProductSearch as runOutcome,
} from "../../src/lib/search.ts";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

/* ---------------- normalizeSearchText / tokenizeSearchQuery ---------------- */

test("normalizeSearchText lowercases and strips punctuation without merging words", () => {
  assert.equal(normalizeSearchText("Gift-Set"), "gift set");
  assert.equal(normalizeSearchText("GIFT SET"), "gift set");
  assert.equal(normalizeSearchText("gift   set"), "gift set");
  assert.equal(normalizeSearchText("  extra   spaces  "), "extra spaces");
});

test("tokenizeSearchQuery keeps multi-word queries as separate tokens", () => {
  assert.deepEqual(tokenizeSearchQuery("gift set"), ["gift", "set"]);
  assert.notDeepEqual(tokenizeSearchQuery("gift set"), ["giftset"]);
});

test("tokenizeSearchQuery singularizes plurals conservatively", () => {
  assert.deepEqual(tokenizeSearchQuery("diaries"), ["diary"]);
  assert.deepEqual(tokenizeSearchQuery("notebooks"), ["notebook"]);
});

/* ---------------- calculateTextSimilarity ---------------- */

test("calculateTextSimilarity: dairy/diary (adjacent transposition) is high", () => {
  const sim = calculateTextSimilarity("dairy", "diary");
  assert.ok(sim >= 0.75, `expected high similarity, got ${sim}`);
});

test("calculateTextSimilarity: unrelated words score low", () => {
  const sim = calculateTextSimilarity("pen", "laptop");
  assert.ok(sim < 0.3, `expected low similarity, got ${sim}`);
});

/* ---------------- mock catalogue (shape mirrors real Product objects) ---------------- */

const mk = (overrides) => ({
  slug: "slug",
  name: "Name",
  category: "Office Stationery",
  subcategories: [],
  summary: "",
  description: "",
  images: [],
  addedOn: "2024-01-01",
  ...overrides,
});

const catalogue = [
  mk({
    slug: "executive-diary-a5",
    name: "Executive Diary",
    productType: "Diary",
    vendor: "OfficeNeed",
    tags: ["diary", "office"],
    description: "A premium hardbound diary for daily planning.",
    specifications: [{ label: "Pages", value: "300" }, { label: "Binding", value: "Hardbound" }],
  }),
  mk({
    slug: "officeneed-wiro-notebook-ruled-250-pages-a4",
    name: "Officeneed Wiro Notebook – Ruled, 250 Pages, A4",
    productType: "Notebook",
    vendor: "OfficeNeed",
    tags: ["notebook", "wiro"],
    description: "A durable wiro-bound notebook for everyday note-taking.",
  }),
  mk({
    slug: "premium-office-diary-2026",
    name: "Premium Office Diary 2026",
    productType: "Diary",
    vendor: "Classmate",
    description: "Ideal for maintaining your diary through the year.",
  }),
  mk({
    slug: "armani-perfume-gift-set",
    name: "Armani Perfume Gift Set",
    productType: "Gift Set",
    vendor: "Armani",
    description: "A curated perfume gift set for special occasions.",
  }),
  mk({
    slug: "premium-ballpoint-pen-pack",
    name: "Premium Ballpoint Pen Pack",
    productType: "Pen",
    vendor: "Cello",
    tags: ["pen", "stationery"],
    description: "A pack of smooth-writing ballpoint pens.",
  }),
  mk({
    slug: "laptop-cooling-pad",
    name: "Laptop Cooling Pad",
    productType: "Computer Accessory",
    vendor: "Zebronics",
    description: "Keeps your laptop cool during long sessions.",
  }),
  // Mirrors real live catalogue shape for the "laptop bag" relevance gate:
  // real tags on the real laptop backpack products are literally ["bags"].
  mk({
    slug: "premium-anti-theft-laptop-backpack",
    name: "Premium Anti-Theft Laptop Backpack",
    productType: "Corporate Gifting",
    vendor: "officeneed",
    tags: ["bags"],
    description: "A rugged, anti-theft backpack built for daily commuting.",
  }),
  mk({
    slug: "premium-travel-laptop-backpack-usb",
    name: "Premium Travel Laptop Backpack with USB Charging Port",
    productType: "Corporate Gifting",
    vendor: "officeneed",
    tags: ["bags"],
    description: "Travel-ready with a built-in USB charging port.",
  }),
  mk({
    slug: "premium-aluminium-foldable-laptop-stand",
    name: "Premium Aluminium Foldable Laptop Stand",
    productType: "Corporate Gifting",
    vendor: "officeneed",
    tags: ["laptop-stand"],
    description: "An adjustable, foldable aluminium stand suitable for laptops and tablets.",
  }),
  mk({
    slug: "premium-sports-travel-duffle-bag",
    name: "Premium Sports Travel Duffle Bag",
    productType: "Corporate Gifting",
    vendor: "officeneed",
    tags: ["bags"],
    description: "A spacious duffle bag for gym and travel essentials.",
  }),
  mk({
    slug: "logitech-m171-wireless-mouse",
    name: "Logitech M171 Wireless Mouse",
    productType: "Computer Peripherals",
    vendor: "Logitech",
    description: "A compact wireless mouse, ideal for laptop and desktop use in any office.",
  }),
  mk({
    slug: "dell-ms116-wired-mouse",
    name: "Dell MS116 Wired Mouse",
    productType: "Computer Peripherals",
    vendor: "Dell",
    description: "A reliable wired mouse for everyday office use.",
  }),
  // "black ink" regression set: mirrors the real live-catalogue bug, where
  // a "drinkware and utensils" TAG contains the literal substring "ink"
  // (d-r-INK-ware), and several drinkware products carry a real "Black"
  // color VARIANT -- together these used to be enough to leak unrelated
  // black-colored drinkware into "black ink" results.
  mk({
    slug: "black-gel-ink-pen",
    name: "Black Gel Ink Pen",
    productType: "Pen",
    vendor: "Cello",
    tags: ["pen", "ink"],
    description: "A smooth-writing gel ink pen for everyday use.",
  }),
  mk({
    slug: "blue-ballpoint-pen",
    name: "Blue Ballpoint Pen",
    productType: "Pen",
    vendor: "Cello",
    tags: ["pen"],
    description: "A reliable ballpoint pen with blue ink.",
  }),
  mk({
    slug: "black-office-mug",
    name: "Black Office Mug",
    productType: "Corporate Gifting",
    vendor: "officeneed",
    tags: ["mug", "office"],
    description: "A sleek ceramic mug for your morning coffee at the office.",
  }),
  mk({
    slug: "stainless-steel-water-bottle-800ml",
    name: "Stainless Steel Water Bottle -800ml",
    productType: "Corporate Gifting",
    vendor: "officeneed",
    tags: ["drinkware and utensils"],
    variants: ["Black", "White"],
    description: "A premium 800ml stainless steel water bottle for daily use at work or the gym.",
  }),
  mk({
    slug: "white-ceramic-mug",
    name: "White Ceramic Mug",
    productType: "Corporate Gifting",
    vendor: "officeneed",
    tags: ["mug"],
    variants: ["White"],
    description: "A classic white ceramic mug, perfect for branding.",
  }),
  mk({
    slug: "red-spiral-notebook-a5",
    name: "Red Spiral Notebook A5",
    productType: "Notebook",
    vendor: "OfficeNeed",
    tags: ["notebook"],
    variants: ["Red", "Blue"],
    description: "A5 spiral-bound ruled notebook, available in vibrant colors.",
  }),
  mk({
    slug: "corporate-gift-hamper",
    name: "Corporate Gift Hamper",
    productType: "Gift Set",
    vendor: "officeneed",
    tags: ["gift sets", "corporate"],
    description: "A curated hamper of premium items for corporate gifting.",
  }),
];

/* ---------------- required test cases (section 14 of the task) ---------------- */

function names(results) {
  return results.map((p) => p.name);
}

test('1. "diary" finds diary products, ranked above description-only mentions', () => {
  const results = searchProducts(catalogue, "diary");
  assert.ok(names(results).includes("Executive Diary"));
  assert.equal(results[0].name, "Executive Diary"); // exact word-in-title beats description-only match
});

test('2. "dairy" (typo) finds diary products via fuzzy matching', () => {
  const results = searchProducts(catalogue, "dairy");
  assert.ok(results.length > 0, "expected at least one fuzzy match");
  assert.ok(names(results).includes("Executive Diary"));
});

test('2b. "dairy" produces a "diary" suggestion', () => {
  const suggestion = getSearchSuggestion(catalogue, "dairy");
  assert.equal(suggestion, "diary");
});

test('3. "notebook" finds the wiro notebook', () => {
  const results = searchProducts(catalogue, "notebook");
  assert.ok(names(results).includes("Officeneed Wiro Notebook – Ruled, 250 Pages, A4"));
});

test('4. "notebok" (typo) still finds the notebook', () => {
  const results = searchProducts(catalogue, "notebok");
  assert.ok(names(results).includes("Officeneed Wiro Notebook – Ruled, 250 Pages, A4"));
});

test('5. "wiro notebook" matches on all tokens present, even non-contiguous', () => {
  const results = searchProducts(catalogue, "wiro notebook");
  assert.equal(results[0].name, "Officeneed Wiro Notebook – Ruled, 250 Pages, A4");
});

test('6. "wire notebook" (typo on wiro) still finds it via fuzzy', () => {
  const results = searchProducts(catalogue, "wire notebook");
  assert.ok(names(results).includes("Officeneed Wiro Notebook – Ruled, 250 Pages, A4"));
});

test('7. "gift set" (two words) finds the gift set product', () => {
  const results = searchProducts(catalogue, "gift set");
  assert.ok(names(results).includes("Armani Perfume Gift Set"));
});

test('8. "giftset" (no space) still finds the gift set product via split recombination', () => {
  const results = searchProducts(catalogue, "giftset");
  assert.ok(names(results).includes("Armani Perfume Gift Set"));
});

test("9. exact product title matches and ranks first", () => {
  const results = searchProducts(catalogue, "Executive Diary");
  assert.equal(results[0].name, "Executive Diary");
});

test("10. partial product title matches", () => {
  const results = searchProducts(catalogue, "wiro");
  assert.ok(names(results).includes("Officeneed Wiro Notebook – Ruled, 250 Pages, A4"));
});

test("11. product type match (Gift Set) surfaces the right product", () => {
  const results = searchProducts(catalogue, "Gift Set");
  assert.ok(names(results).includes("Armani Perfume Gift Set"));
});

test("12. brand/vendor match (Cello) surfaces the right product", () => {
  const results = searchProducts(catalogue, "Cello");
  assert.ok(names(results).includes("Premium Ballpoint Pen Pack"));
});

test("13. Product Details (specification value) match (Hardbound)", () => {
  const results = searchProducts(catalogue, "Hardbound");
  assert.ok(names(results).includes("Executive Diary"));
});

test("14. query with extra spaces behaves the same as trimmed query", () => {
  const spaced = searchProducts(catalogue, "  wiro   notebook  ");
  const clean = searchProducts(catalogue, "wiro notebook");
  assert.deepEqual(names(spaced), names(clean));
});

test("15. an intentionally invalid/random query returns no results and no garbage", () => {
  const results = searchProducts(catalogue, "xqzflorbnonsense");
  assert.equal(results.length, 0);
});

/* ---------------- short-word strictness (requirement 7) ---------------- */

test('"pen" does not fuzzy-match unrelated short words', () => {
  const results = searchProducts(catalogue, "pen");
  // Every result must be a genuine pen-related product, never a false
  // positive pulled in by loose short-word fuzzy matching.
  for (const p of results) {
    assert.ok(/pen/i.test(p.name) || (p.tags ?? []).some((t) => /pen/i.test(t)), `unexpected match: ${p.name}`);
  }
  assert.ok(names(results).includes("Premium Ballpoint Pen Pack"));
});

test('"pen" is not corrected away from itself', () => {
  const suggestion = getSearchSuggestion(catalogue, "pen");
  assert.equal(suggestion, null);
});

/* ---------------- multi-word relevance gate ("laptop bag") ---------------- */

test('"laptop bag": bag/backpack products dominate the top results', () => {
  const results = searchProducts(catalogue, "laptop bag");
  const top = names(results).slice(0, 4);
  assert.ok(top.includes("Premium Anti-Theft Laptop Backpack"), `top results: ${top}`);
  assert.ok(top.includes("Premium Travel Laptop Backpack with USB Charging Port"), `top results: ${top}`);
});

test('"laptop bag": a laptop stand (description-only "laptop" match, no "bag" anywhere) is excluded', () => {
  const results = searchProducts(catalogue, "laptop bag");
  assert.ok(!names(results).includes("Premium Aluminium Foldable Laptop Stand"), names(results).join(", "));
});

test('"laptop bag": a wireless mouse (description-only "laptop" mention) is excluded', () => {
  const results = searchProducts(catalogue, "laptop bag");
  assert.ok(!names(results).includes("Logitech M171 Wireless Mouse"), names(results).join(", "));
});

test('"laptop bag": a duffle bag (real "bag" evidence, zero "laptop" evidence anywhere) is excluded', () => {
  const results = searchProducts(catalogue, "laptop bag");
  assert.ok(!names(results).includes("Premium Sports Travel Duffle Bag"), names(results).join(", "));
});

test('"wireless mouse": mouse products rank first, wired mouse (missing "wireless") is not a strong match', () => {
  const results = searchProducts(catalogue, "wireless mouse");
  assert.equal(results[0].name, "Logitech M171 Wireless Mouse");
  const top = names(results).slice(0, 3);
  assert.ok(!top.includes("Dell MS116 Wired Mouse"), `top results: ${top}`);
});

test("multi-word gate still finds real results when evidence genuinely exists (no false empty state)", () => {
  const results = searchProducts(catalogue, "premium diary");
  assert.ok(results.length > 0);
});

test("multi-word gate falls back to the full ranked set rather than ever going empty", () => {
  // No product in this catalogue has strong evidence for both "cool" and
  // "backpack" together -- the gate should fall back instead of returning zero.
  const results = searchProducts(catalogue, "cool backpack");
  assert.ok(results.length > 0);
});

/* ---------------- global relevance model: word-boundary matching + IDF ---------------- */

test('"black ink": ink pen is the top result, ranked far above any generic match', () => {
  const results = searchProducts(catalogue, "black ink");
  assert.equal(results[0].name, "Black Gel Ink Pen");
});

test('"black ink": a "Black" color VARIANT does not fake evidence for "ink" via the "drinkware" tag substring bug', () => {
  // Regression for the real bug: "ink" is a literal substring of the tag
  // "drinkware and utensils". A naive .includes() check made every
  // black-variant drinkware product look like it had "ink" evidence too.
  const results = searchProducts(catalogue, "black ink");
  assert.ok(!names(results).includes("Stainless Steel Water Bottle -800ml"), names(results).join(", "));
});

test('"black ink": a black mug with zero "ink" evidence anywhere is excluded', () => {
  const results = searchProducts(catalogue, "black ink");
  assert.ok(!names(results).includes("Black Office Mug"), names(results).join(", "));
});

test('"blue pen": the pen with real "blue" evidence wins, generic pens don\'t crowd it out', () => {
  const results = searchProducts(catalogue, "blue pen");
  assert.equal(results[0].name, "Blue Ballpoint Pen");
});

test('"red notebook": the red-variant notebook is the top (only) strong result', () => {
  const results = searchProducts(catalogue, "red notebook");
  assert.equal(results[0].name, "Red Spiral Notebook A5");
});

test('"white mug": the white-variant mug outranks a mug with no color evidence', () => {
  const results = searchProducts(catalogue, "white mug");
  assert.equal(results[0].name, "White Ceramic Mug");
});

test('"corporate gift": the corporate gift hamper is a strong (top) result', () => {
  const results = searchProducts(catalogue, "corporate gift");
  assert.equal(results[0].name, "Corporate Gift Hamper");
});

test("IDF: a rare token (ink, few products) outweighs a common token (black, many products) in ranking", () => {
  // "black" appears on the mug, the water bottle (via variant) and the pen;
  // "ink" appears only on the two pens. The ink pens must not be diluted by
  // the fact that "black" alone is a very common, low-signal token.
  const outcome = runOutcome(catalogue, "black ink");
  const inkPen = outcome.results.find((r) => r.product.name === "Black Gel Ink Pen");
  assert.ok(inkPen, "expected the ink pen to be a result at all");
  assert.ok(inkPen.score > 500, `expected a strong score, got ${inkPen.score}`);
});

/* ---------------- hard vs soft token classification (no combined match exists) ---------------- */

// A separate minimal catalogue where NO product combines the concept
// ("notebook") with the attribute ("red") -- this is the exact real-world
// shape of the live-catalogue bug: several unrelated products carry a real
// "Red" color VARIANT (pen, keychain, backpack), and a notebook exists with
// no color information at all. The attribute must never override the
// missing concept.
const noOverlapCatalogue = [
  mk({ slug: "plain-notebook", name: "Plain Ruled Notebook", productType: "Notebook", tags: ["notebook"], description: "A simple ruled notebook for everyday notes." }),
  mk({ slug: "red-metal-pen", name: "Metal Ballpoint Pen", productType: "Pen", tags: ["pen"], variants: ["Red", "Blue"], description: "A durable metal ballpoint pen." }),
  mk({ slug: "red-keychain", name: "Metal Keychain", productType: "Corporate Gifting", tags: ["keychain"], variants: ["Red", "Black"], description: "A sturdy metal keychain for everyday carry." }),
  mk({ slug: "red-backpack", name: "Travel Backpack", productType: "Corporate Gifting", tags: ["bags"], variants: ["Red", "Gray"], description: "A spacious travel backpack." }),
];

test('"red notebook" (no product combines both): the notebook ranks first despite having no color evidence', () => {
  const results = searchProducts(noOverlapCatalogue, "red notebook");
  assert.equal(results[0]?.name, "Plain Ruled Notebook", names(results).join(", "));
});

test('"red notebook" (no product combines both): a red pen/keychain/backpack with ZERO notebook evidence is excluded entirely', () => {
  const results = searchProducts(noOverlapCatalogue, "red notebook");
  assert.ok(!names(results).includes("Metal Ballpoint Pen"), names(results).join(", "));
  assert.ok(!names(results).includes("Metal Keychain"), names(results).join(", "));
  assert.ok(!names(results).includes("Travel Backpack"), names(results).join(", "));
});

console.log(`\n${passed} test(s) passed.`);
