// Run with: npx tsx --test src/lib/email-service.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmailFrom, EMAIL_FROM_NAME } from "./email-service.ts";

test("display name is exactly 'Officeneed Assistant'", () => {
  assert.equal(EMAIL_FROM_NAME, "Officeneed Assistant");
});

test("a wrongly-cased configured name is corrected, the configured address is kept", () => {
  assert.equal(buildEmailFrom("OfficeNeed Assistant <assistant@officeneed.in>"), "Officeneed Assistant <assistant@officeneed.in>");
  assert.equal(buildEmailFrom("OfficeNeed <contact@officeneed.in>"), "Officeneed Assistant <contact@officeneed.in>");
  assert.equal(buildEmailFrom('"Some Other Name" <care@officeneed.in>'), "Officeneed Assistant <care@officeneed.in>");
});

test("an already-correct value and a bare address both come out canonical", () => {
  assert.equal(buildEmailFrom("Officeneed Assistant <assistant@officeneed.in>"), "Officeneed Assistant <assistant@officeneed.in>");
  assert.equal(buildEmailFrom("assistant@officeneed.in"), "Officeneed Assistant <assistant@officeneed.in>");
});

test("unset or blank falls back to the existing default address; unparseable is left untouched", () => {
  assert.equal(buildEmailFrom(undefined), "Officeneed Assistant <contact@officeneed.in>");
  assert.equal(buildEmailFrom("   "), "Officeneed Assistant <contact@officeneed.in>");
  assert.equal(buildEmailFrom("not an address"), "not an address");
});
