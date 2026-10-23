// Run with: npx tsx --test src/lib/clarity.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLARITY_PROJECT_ID, CLARITY_MASK, isClarityAllowed } from "./clarity.ts";

test("uses the Officeneed Clarity project", () => {
  assert.equal(CLARITY_PROJECT_ID, "z2a061qk44");
});

test("masking attribute is Clarity's documented one", () => {
  assert.deepEqual(CLARITY_MASK, { "data-clarity-mask": "True" });
});

test("storefront pages are allowed", () => {
  for (const [p, q] of [["/", ""], ["/products", "?collection=perfumes"], ["/products/armani-acqua-di-gio-parfum-100-ml", ""], ["/cart", ""], ["/account/orders", ""], ["/contact-us", ""]]) {
    assert.equal(isClarityAllowed(p, q), true, p + q);
  }
});

test("credential / one-time-link routes are never allowed", () => {
  for (const p of ["/password-reset", "/reset-password", "/activate", "/auth", "/auth/", "/activate/x"]) {
    assert.equal(isClarityAllowed(p, ""), false, p);
  }
});

test("any URL carrying a credential parameter is never allowed, even on an otherwise normal path", () => {
  for (const q of ["?reset_url=https%3A%2F%2Fx", "?activation_url=abc", "?a=1&token=zzz", "?key=abc", "?customer_id=1"]) {
    assert.equal(isClarityAllowed("/", q), false, q);
  }
  assert.equal(isClarityAllowed("/products", "?sort=Featured&q=pen"), true);
  assert.equal(isClarityAllowed("/products", "q=pen"), true, "search without leading ? is handled");
});
