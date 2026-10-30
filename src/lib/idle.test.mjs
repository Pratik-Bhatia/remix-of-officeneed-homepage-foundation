// Tests for src/lib/idle.ts (deferring non-critical work until after load + idle).
// Run with: npx tsx --test src/lib/idle.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { whenIdleAfterLoad } from "./idle";

function fakeBrowser({ readyState = "loading", idle = true } = {}) {
  const listeners = {};
  const idleQueue = [];
  globalThis.document = { readyState };
  globalThis.window = {
    addEventListener: (t, f) => ((listeners[t] ??= []).push(f)),
    removeEventListener: (t, f) => (listeners[t] = (listeners[t] ?? []).filter((x) => x !== f)),
    ...(idle ? { requestIdleCallback: (f) => idleQueue.push(f), cancelIdleCallback: () => {} } : {}),
  };
  return {
    fireLoad: () => { globalThis.document.readyState = "complete"; for (const f of listeners.load ?? []) f(); },
    runIdle: () => { while (idleQueue.length) idleQueue.shift()(); },
  };
}

test("waits for the load event, then for idle", () => {
  const b = fakeBrowser();
  let ran = 0;
  whenIdleAfterLoad(() => ran++);
  b.runIdle();
  assert.equal(ran, 0, "nothing before load");
  b.fireLoad();
  assert.equal(ran, 0, "load alone schedules, doesn't run");
  b.runIdle();
  assert.equal(ran, 1);
});

test("after load already happened: runs on the next idle period", () => {
  const b = fakeBrowser({ readyState: "complete" });
  let ran = 0;
  whenIdleAfterLoad(() => ran++);
  assert.equal(ran, 0);
  b.runIdle();
  assert.equal(ran, 1);
});

test("cancel before it runs prevents it", () => {
  const b = fakeBrowser();
  let ran = 0;
  const cancel = whenIdleAfterLoad(() => ran++);
  cancel();
  b.fireLoad();
  b.runIdle();
  assert.equal(ran, 0);
});

test("no page-lifecycle API at all: runs immediately instead of never", () => {
  globalThis.window = {};
  globalThis.document = {};
  let ran = 0;
  whenIdleAfterLoad(() => ran++);
  assert.equal(ran, 1);
});
