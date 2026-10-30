// Regression test for the "Coming Soon banner appears on the wrong pages"
// bug: Hero.tsx's slides array hardcoded two collection-handle query
// strings ("fragrance-gifting", "exclusive-products") that had drifted out
// of sync with the real taxonomy.ts handles ("perfumes",
// "officeneed-exclusive") -- products.index.tsx's Coming Soon banner then
// correctly-but-misleadingly treated those as genuinely empty categories,
// since no live product actually carries those made-up handles.
//
// This asserts the general invariant that would have caught it: every
// `?collection=<handle>` a Hero CTA links to must resolve to a real node
// in TAXONOMY via getCategoryByHandle -- the same lookup
// products.index.tsx itself uses to decide whether a category is real.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/components/officeneed/Hero.collection-handles.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { getCategoryByHandle } from "@/lib/taxonomy";

// Hero.tsx imports its slide images (Vite turns them into hashed URLs in the
// real build). Node can't load .webp files, and this test only checks link
// targets, so a load hook answers .webp imports with their URL string --
// what Vite's import gives -- before Hero.tsx is loaded.
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function load(url, context, next) {" +
        " if (url.endsWith('.webp')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true };" +
        " return next(url, context); }",
    ),
);
const { slides } = await import("./Hero.tsx");

function collectionHandleFromHref(href) {
  const match = href.match(/[?&]collection=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

test("every Hero slide CTA that links to a collection resolves to a real taxonomy node", () => {
  const checked = [];
  for (const slide of slides) {
    for (const cta of [slide.primary, slide.secondary]) {
      const handle = collectionHandleFromHref(cta.href);
      if (!handle) continue; // "#open-chat", "/products/" (all products), etc. -- not collection-scoped
      checked.push({ slide: slide.id, label: cta.label, handle });
      const match = getCategoryByHandle(handle);
      assert.ok(
        match,
        `Hero slide "${slide.id}" CTA "${cta.label}" links to collection="${handle}", which does not match any TAXONOMY handle -- this is exactly the stale-handle bug that made products.index.tsx show the Coming Soon banner for a category that actually has products.`,
      );
    }
  }
  // Guards the test itself against silently checking zero CTAs (e.g. if
  // slides' shape ever changes) -- this file's whole job is checking real
  // collection-scoped hrefs, not passing vacuously.
  assert.ok(checked.length >= 5, `expected to check several collection-scoped Hero CTAs, only found ${checked.length}`);
});

test("the two historically-wrong handles are not reintroduced", () => {
  const allHandles = slides
    .flatMap((s) => [s.primary, s.secondary])
    .map((cta) => collectionHandleFromHref(cta.href))
    .filter(Boolean);
  assert.ok(!allHandles.includes("fragrance-gifting"), "the real Fragrance Gifting handle is \"perfumes\", not \"fragrance-gifting\"");
  assert.ok(!allHandles.includes("exclusive-products"), "the real Officeneed Exclusive handle is \"officeneed-exclusive\", not \"exclusive-products\"");
});
