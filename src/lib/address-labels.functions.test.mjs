import { test } from "node:test";
import assert from "node:assert/strict";

const { isAddressLabel, ADDRESS_LABELS } = await import("@/lib/address-labels.functions");

test("isAddressLabel: accepts every value in the fixed label set", () => {
  for (const label of ADDRESS_LABELS) {
    assert.equal(isAddressLabel(label), true);
  }
});

test("isAddressLabel: rejects free text, empty string, and non-strings", () => {
  assert.equal(isAddressLabel("Home"), false, "not in the fixed set -- free text must never be accepted");
  assert.equal(isAddressLabel(""), false);
  assert.equal(isAddressLabel("office"), false, "case-sensitive -- must match the exact fixed label");
  assert.equal(isAddressLabel(null), false);
  assert.equal(isAddressLabel(undefined), false);
  assert.equal(isAddressLabel(42), false);
});
