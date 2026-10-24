// Run with: npx tsx --test --experimental-test-module-mocks src/lib/body-scroll-lock.test.mjs
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// A real CSSStyleDeclaration reads "" for any property that was never set (never undefined).
const makeStyle = (initial = {}) => new Proxy({ ...initial }, { get: (t, k) => (k in t ? t[k] : "") });
const body = { style: makeStyle() };
const html = { style: makeStyle(), clientWidth: 375 };
const scrolls = [];
let scrollbarPaddingSeen = "";

globalThis.document = { body, documentElement: html };
globalThis.window = {
  scrollX: 0,
  scrollY: 0,
  innerWidth: 375,
  getComputedStyle: () => ({ paddingRight: scrollbarPaddingSeen }),
  scrollTo: (x, y) => scrolls.push({ x, y, behaviorAtCall: html.style.scrollBehavior }),
};

const { lockBodyScroll } = await import("@/lib/body-scroll-lock");

beforeEach(() => {
  body.style = makeStyle();
  html.style = makeStyle();
  html.clientWidth = 375;
  scrolls.length = 0;
  scrollbarPaddingSeen = "";
  window.scrollX = 0;
  window.scrollY = 0;
  window.innerWidth = 375;
});

test("locking pins the body at the current scroll offset and blocks overscroll", () => {
  window.scrollY = 640;
  const release = lockBodyScroll();
  assert.equal(body.style.position, "fixed");
  assert.equal(body.style.top, "-640px");
  assert.equal(body.style.width, "100%");
  assert.equal(body.style.overflow, "hidden");
  assert.equal(body.style.overscrollBehavior, "none");
  assert.equal(html.style.overscrollBehavior, "none");
  release();
});

test("releasing restores every previous inline style and the exact scroll position", () => {
  body.style = makeStyle({ position: "relative", top: "3px", overflow: "auto", paddingRight: "8px" });
  html.style = makeStyle({ scrollBehavior: "smooth", overscrollBehavior: "auto" });
  window.scrollX = 12;
  window.scrollY = 987;
  const release = lockBodyScroll();
  release();
  assert.deepEqual(
    { position: body.style.position, top: body.style.top, overflow: body.style.overflow, paddingRight: body.style.paddingRight },
    { position: "relative", top: "3px", overflow: "auto", paddingRight: "8px" },
  );
  assert.equal(html.style.scrollBehavior, "smooth");
  assert.equal(html.style.overscrollBehavior, "auto");
  assert.equal(scrolls.length, 1);
  assert.deepEqual({ x: scrolls[0].x, y: scrolls[0].y }, { x: 12, y: 987 });
  // restored instantly, not animated by a smooth-scrolling stylesheet
  assert.equal(scrolls[0].behaviorAtCall, "auto");
});

test("a page that had no inline styles ends with none (nothing left behind)", () => {
  window.scrollY = 50;
  lockBodyScroll()();
  for (const p of ["position", "top", "left", "width", "overflow", "paddingRight", "overscrollBehavior"]) {
    assert.equal(body.style[p], "", `body.style.${p} should be cleared`);
  }
  assert.equal(html.style.overscrollBehavior, "");
  assert.equal(html.style.scrollBehavior, "");
});

test("the vanishing desktop scrollbar is compensated with padding so the layout does not jump", () => {
  window.innerWidth = 1440;
  html.clientWidth = 1425; // 15px scrollbar
  scrollbarPaddingSeen = "4px";
  const release = lockBodyScroll();
  assert.equal(body.style.paddingRight, "19px");
  release();
  assert.equal(body.style.paddingRight, "");
});

test("overlapping locks share one lock: only the last release restores the page", () => {
  window.scrollY = 300;
  const a = lockBodyScroll();
  window.scrollY = 0; // the body is already pinned, so a second caller must not re-capture a bogus offset
  const b = lockBodyScroll();
  a();
  assert.equal(body.style.position, "fixed", "still locked while another overlay holds the lock");
  assert.equal(scrolls.length, 0);
  b();
  assert.equal(body.style.position, "");
  assert.deepEqual({ x: scrolls[0].x, y: scrolls[0].y }, { x: 0, y: 300 });
});

test("calling a release function twice never over-releases someone else's lock", () => {
  const a = lockBodyScroll();
  const b = lockBodyScroll();
  a();
  a(); // duplicate
  assert.equal(body.style.position, "fixed", "b still holds the lock");
  b();
  assert.equal(body.style.position, "");
});

test("repeated open/close cycles leave the page clean and scroll where it started", () => {
  for (let i = 0; i < 5; i++) {
    window.scrollY = 100 + i;
    const release = lockBodyScroll();
    assert.equal(body.style.top, `${-(100 + i)}px`);
    release();
    assert.equal(body.style.position, "");
  }
  assert.equal(scrolls.length, 5);
  assert.deepEqual(scrolls.map((s) => s.y), [100, 101, 102, 103, 104]);
});
