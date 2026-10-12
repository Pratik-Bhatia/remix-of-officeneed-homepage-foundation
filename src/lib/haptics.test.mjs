// Run with: npx tsx --test src/lib/haptics.test.mjs
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { haptic, isHapticsSupported, HAPTIC_PATTERNS, HAPTIC_COOLDOWN_MS, __resetHaptics } from "./haptics.ts";

const env = (over = {}) => {
  const calls = [];
  let t = 1000;
  return {
    calls,
    advance: (ms) => (t += ms),
    navigator: { vibrate: (p) => (calls.push(p), true) },
    matchMedia: () => ({ matches: false }),
    now: () => t,
    ...over,
  };
};

beforeEach(() => __resetHaptics());

test("unsupported browser is a safe no-op", () => {
  assert.equal(isHapticsSupported({}), false);
  assert.equal(haptic("success", {}), false);
  assert.equal(haptic("error", { navigator: {} }), false);
});

test("uses typed patterns", () => {
  for (const p of ["light", "success", "error"]) {
    __resetHaptics();
    const e = env();
    assert.equal(haptic(p, e), true);
    assert.deepEqual(e.calls[0], HAPTIC_PATTERNS[p]);
  }
});

test("rapid repeats are throttled, then allowed after cooldown", () => {
  const e = env();
  assert.equal(haptic("light", e), true);
  assert.equal(haptic("light", e), false);
  e.advance(HAPTIC_COOLDOWN_MS);
  assert.equal(haptic("light", e), true);
  assert.equal(e.calls.length, 2);
});

test("respects prefers-reduced-motion", () => {
  const e = env({ matchMedia: () => ({ matches: true }) });
  assert.equal(haptic("success", e), false);
  assert.equal(e.calls.length, 0);
});

test("vibrate throwing or returning false never throws", () => {
  assert.equal(haptic("error", env({ navigator: { vibrate: () => { throw new Error("x"); } } })), false);
  assert.equal(haptic("error", env({ navigator: { vibrate: () => false } })), false);
});
