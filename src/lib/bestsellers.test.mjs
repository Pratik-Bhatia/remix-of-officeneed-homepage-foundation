// Run with: npx tsx --test src/lib/bestsellers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectBestsellers, inBestsellerCategory } from "./bestsellers.ts";

const p = (slug, handles, name = slug) => ({ slug, name, collectionHandles: handles });

const mouse1 = p("mouse-1", ["computer-accessories-1"]);
const mouse2 = p("mouse-2", ["computer-accessories"]);
const mouse3 = p("mouse-3", ["computer-accessories"]);
const notebook = p("notebook", ["office-stationary"], "Spiral Notebook");
const copier = p("copier-paper", ["printing-papers"]);
const giftset = p("gift-set", ["gift-sets"]);
const diary = p("diary", ["diaries"], "Leather Notebook Diary");
const perfume = p("perfume", ["european-perfume"]);
const candle = p("candle", ["perfumes"], "Sandalwood Candle");
const incense = p("incense", ["perfumes"], "Rose Incense Sticks");
const exclusiveNotebook = p("excl-notebook", ["officeneed-exclusive", "office-stationary"]);
const unmapped = p("unmapped", [], "Mouse Gift Set Notebook");
const multi = p("multi", ["gift-sets", "computer-accessories"]);

const catalogue = [mouse1, mouse2, mouse3, notebook, copier, giftset, diary, perfume, candle, incense, exclusiveNotebook, unmapped];
const slugs = (xs) => xs.map((x) => x.slug);

test("All mixes every main category, not just the top-ranked one", () => {
  const out = selectBestsellers(catalogue, "All", 4);
  assert.deepEqual(slugs(out), ["gift-set", "notebook", "mouse-1", "perfume"]);
});

test("All falls back to remaining categories when one runs out", () => {
  const out = selectBestsellers([mouse1, mouse2, mouse3, perfume], "All", 4);
  assert.deepEqual(slugs(out), ["mouse-1", "perfume", "mouse-2", "mouse-3"]);
});

test("Corporate Gifting includes subcategories, excludes stationery and peripherals", () => {
  const out = slugs(selectBestsellers(catalogue, "Corporate Gifting"));
  assert.deepEqual(out, ["gift-set", "diary"]);
});

test("Officeneed Exclusive stationery is not pushed into Corporate Gifting", () => {
  assert.equal(inBestsellerCategory(exclusiveNotebook, "Corporate Gifting"), false);
  assert.equal(inBestsellerCategory(exclusiveNotebook, "Office Stationery"), true);
});

test("Office Stationery excludes gifts and peripherals", () => {
  assert.deepEqual(slugs(selectBestsellers(catalogue, "Office Stationery")), ["notebook", "copier-paper", "excl-notebook"]);
});

test("Computer Peripherals excludes stationery and gifting", () => {
  assert.deepEqual(slugs(selectBestsellers(catalogue, "Computer Peripherals")), ["mouse-1", "mouse-2", "mouse-3"]);
});

test("Fragrance excludes candles and incense", () => {
  assert.deepEqual(slugs(selectBestsellers(catalogue, "Fragrance Gifting")), ["perfume"]);
});

test("Products with no collection mapping are never guessed from the title", () => {
  for (const tab of ["All", "Corporate Gifting", "Office Stationery", "Computer Peripherals"]) {
    assert.ok(!slugs(selectBestsellers(catalogue, tab)).includes("unmapped"));
  }
});

test("A product in two categories appears only once in All", () => {
  const out = slugs(selectBestsellers([multi, mouse1, giftset], "All", 12));
  assert.equal(out.filter((s) => s === "multi").length, 1);
  assert.equal(new Set(out).size, out.length);
});
