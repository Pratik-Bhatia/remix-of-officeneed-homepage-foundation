// Tests for src/lib/load-status.ts.
// Run with: npx tsx --test src/lib/load-status.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { queryLoadStatus } from "./load-status";

test("data in hand is success -- including during a background refresh or after a later refetch error", () => {
  assert.equal(queryLoadStatus({ data: [], isError: false, fetchStatus: "idle" }), "success", "an empty result is a real empty state");
  assert.equal(queryLoadStatus({ data: [1], isError: false, fetchStatus: "fetching" }), "success", "cached data stays visible while refreshing");
  assert.equal(queryLoadStatus({ data: [1], isError: true, fetchStatus: "idle" }), "success");
});

test("no data: fetching or not-yet-started is loading; a finished failure is error (never empty)", () => {
  assert.equal(queryLoadStatus({ data: undefined, isError: false, fetchStatus: "fetching" }), "loading");
  assert.equal(queryLoadStatus({ data: undefined, isError: false, fetchStatus: "idle" }), "loading", "server render / first frame");
  assert.equal(queryLoadStatus({ data: undefined, isError: true, fetchStatus: "idle" }), "error");
  assert.equal(queryLoadStatus({ data: undefined, isError: true, fetchStatus: "fetching" }), "loading", "retrying after an error");
});

test("a disabled query with no data is idle", () => {
  assert.equal(queryLoadStatus({ data: undefined, isError: false, fetchStatus: "idle" }, false), "idle");
});
