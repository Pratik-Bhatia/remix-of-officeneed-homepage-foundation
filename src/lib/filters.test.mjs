// Run with: npx tsx --test src/lib/filters.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { productMatchesFilters, normalizeFilterValue, deriveFilterAttributes, buildFilterGroups } from "./filters.ts";

const node = (title, tags) => ({ title, tags, description: "" });
const prod = (title, tags) => ({ title, priceAmount: 1000, filterAttributes: deriveFilterAttributes(node(title, tags), "Computer Peripherals") });
// Mirrors real tag shapes seen in the live catalogue.
const printer = prod("PIXMA G3770", ["printer"]);
const mouse = prod("Logitech M185 Wireless Mouse", ["Bluetooth", "Mouse", "Wireless"]);
const mouseOnly = prod("Logitech M170 Wireless Mouse", ["Mouse"]);
const keyboard = prod("Dell KM3322W", ["Bluetooth", "Keyboard", "Wireless"]);
const all = [printer, mouse, mouseOnly, keyboard];
const run = (f) => all.filter((p) => productMatchesFilters(p, f)).map((p) => p.title);

test("normalises case and whitespace", () => {
  assert.equal(normalizeFilterValue("  Wireless   Combo "), "wireless combo");
  assert.deepEqual(prod("x", ["Mouse", "mouse ", "WIRELESS"]).filterAttributes, { connectivity: ["wireless"], type: ["mouse"] });
});
test("different groups combine with AND", () => {
  assert.deepEqual(run({ type: ["mouse"], connectivity: ["wireless"] }), [mouse.title]);
});
test("options within one group combine with OR", () => {
  assert.deepEqual(run({ type: ["printer", "mouse"] }), [printer.title, mouse.title, mouseOnly.title]);
  assert.deepEqual(run({ type: ["printer", "mouse"], connectivity: ["bluetooth"] }), [mouse.title]);
});
test("product missing an attribute does not match that group", () => {
  assert.deepEqual(run({ type: ["printer"], connectivity: ["wireless"] }), []);
});
test("three groups and legacy-cased values", () => {
  assert.deepEqual(run({ type: ["Keyboard"], connectivity: ["Wireless", "bluetooth"], price: ["x"] }).length, 0);
  assert.deepEqual(run({ type: ["Keyboard"], connectivity: ["Wireless"] }), [keyboard.title]);
});
test("no active filters returns everything", () => {
  assert.equal(run({}).length, all.length);
});
test("cased duplicates collapse into one option", () => {
  const g = buildFilterGroups("Computer Peripherals", [prod("a", ["Mouse"]), prod("b", ["mouse"])]);
  assert.deepEqual(g.find((x) => x.id === "type").options, [{ value: "mouse", label: "Mouse" }]);
});
