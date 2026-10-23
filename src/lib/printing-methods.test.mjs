// Run with: npx tsx --test src/lib/printing-methods.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { UV_MIN_QUANTITY, isUvAvailableForQuantity, resolvePrintingMethod, summarizeComponentMethods } from "./printing-methods.ts";

test("UV needs the existing 25-unit minimum", () => {
  assert.equal(UV_MIN_QUANTITY, 25);
  assert.equal(isUvAvailableForQuantity(24), false);
  assert.equal(isUvAvailableForQuantity(25), true);
});

test("a UV request resolves to UV only at or above the minimum, else Laser", () => {
  assert.equal(resolvePrintingMethod("UV Printing", 25), "UV Printing");
  assert.equal(resolvePrintingMethod("UV Printing", 24), "Laser Engraving");
  assert.equal(resolvePrintingMethod("Laser Engraving", 100), "Laser Engraving");
  assert.equal(resolvePrintingMethod(undefined, 100), "Laser Engraving");
});

test("components keep their own method: independent resolution at the same quantity", () => {
  const diary = resolvePrintingMethod("UV Printing", 30);
  const pen = resolvePrintingMethod("Laser Engraving", 30);
  assert.deepEqual([diary, pen], ["UV Printing", "Laser Engraving"]);
});

test("summary names each component when methods differ, collapses when they match", () => {
  assert.equal(
    summarizeComponentMethods([{ name: "A5 Notebook Diary", method: "UV Printing" }, { name: "Ball Pen", method: "Laser Engraving" }]),
    "A5 Notebook Diary: UV Printing; Ball Pen: Laser Engraving",
  );
  assert.equal(
    summarizeComponentMethods([{ name: "Diary", method: "Laser Engraving" }, { name: "Pen", method: "Laser Engraving" }]),
    "Laser Engraving",
  );
  assert.equal(summarizeComponentMethods([]), "");
});
