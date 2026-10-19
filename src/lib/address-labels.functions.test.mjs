import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Mutable per-test implementation -- swapped per test via currentImpl,
// matching this repo's established single-mock.module()-per-file pattern.
let currentImpl = async () => null;
mock.module("@/lib/customer", {
  namedExports: { fetchCustomer: (token) => currentImpl(token) },
});

const { isAddressLabel, ADDRESS_LABELS, resolveOwnedAddressIdsExpecting } = await import("@/lib/address-labels.functions");

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

test("resolveOwnedAddressIdsExpecting: retries until a freshly-created address shows up (Shopify read-after-write lag)", async () => {
  // Models the live bug: right after customerAddressCreate, the very next
  // customer.addresses read doesn't include the new address yet -- it only
  // shows up on a later read. Must not reject a legitimately-just-created
  // address as "not owned".
  let calls = 0;
  currentImpl = async () => {
    calls++;
    const addresses = calls < 2 ? [] : [{ id: "gid://shopify/MailingAddress/1" }];
    return { id: "gid://shopify/Customer/1", addresses };
  };
  const result = await resolveOwnedAddressIdsExpecting("tok", "gid://shopify/MailingAddress/1");
  assert.ok(result.addressIds.has("gid://shopify/MailingAddress/1"));
  assert.equal(calls, 2, "should stop retrying as soon as the address appears");
});

test("resolveOwnedAddressIdsExpecting: still rejects an address that genuinely never belongs to this customer", async () => {
  let calls = 0;
  currentImpl = async () => {
    calls++;
    return { id: "gid://shopify/Customer/1", addresses: [{ id: "gid://shopify/MailingAddress/999" }] };
  };
  const result = await resolveOwnedAddressIdsExpecting("tok", "gid://shopify/MailingAddress/1");
  assert.ok(!result.addressIds.has("gid://shopify/MailingAddress/1"));
  assert.ok(calls > 1, "must exhaust retries before giving up, not reject on the first miss");
});
