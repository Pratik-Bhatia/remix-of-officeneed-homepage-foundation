// Run with: npx tsx --test src/components/officeneed/CorporateGiftingCarousel.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectCorporateGifts, CORPORATE_GIFT_SET_HANDLES } from "./CorporateGiftingCarousel.tsx";

const prod = (slug, name, handles = ["corporate-gifting", "gift-sets"], subs = ["Gift Sets"]) => ({
  slug,
  name,
  collectionHandles: handles,
  subcategories: subs,
});

const curated = CORPORATE_GIFT_SET_HANDLES.map((h) => prod(h, `Curated ${h}`));

test("curated sets come first, in display order", () => {
  const other = prod("other-set", "Premium 2-in-1 Gift Set");
  const out = selectCorporateGifts([other, ...[...curated].reverse()]);
  assert.deepEqual(
    out.map((p) => p.slug),
    [...CORPORATE_GIFT_SET_HANDLES, "other-set"],
  );
});

test("missing or unpublished curated handles are skipped, others still render", () => {
  const out = selectCorporateGifts([curated[0], curated[2]]);
  assert.deepEqual(out.map((p) => p.slug), [CORPORATE_GIFT_SET_HANDLES[0], CORPORATE_GIFT_SET_HANDLES[2]]);
});

test("fills with non-curated gift sets from Corporate Gifting", () => {
  const fillers = [
    prod("a", "Premium 5-in-1 Executive Corporate Gift Set"),
    prod("b", "Sheaffer Gift Set 100 Ballpoint Pen"),
    prod("c", "Festive Hamper", ["corporate-gifting"], ["Diaries"]), // name match, no gift-sets sub
  ];
  const out = selectCorporateGifts(fillers);
  assert.deepEqual(out.map((p) => p.slug), ["a", "b", "c"]);
});

test("excludes non-gift-set Corporate Gifting products and other categories", () => {
  const out = selectCorporateGifts([
    prod("pen", "Parker Vector Ballpoint Pen", ["corporate-gifting", "luxury-pens"], ["Luxury Pens"]),
    prod("mouse", "Logitech Mouse", ["computer-peripherals"], ["Computer Accessories"]),
    prod("set", "Premium 3-in-1 Gift Set"),
  ]);
  assert.deepEqual(out.map((p) => p.slug), ["set"]);
});

test("never duplicates a product and caps at 12", () => {
  const many = Array.from({ length: 20 }, (_, i) => prod(`set-${i}`, `Gift Set ${i}`));
  const out = selectCorporateGifts([...curated, ...many, ...many]);
  assert.equal(out.length, 12);
  assert.equal(new Set(out.map((p) => p.slug)).size, out.length);
});

test("returns empty when the store has no eligible sets", () => {
  assert.deepEqual(selectCorporateGifts([]), []);
});
