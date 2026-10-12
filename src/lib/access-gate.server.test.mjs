// Regression tests for the temporary pre-launch access gate
// (src/lib/access-gate.server.ts). Exercises the module directly with
// real Request objects and a real (test-only) signing secret/code --
// no network call, no real Shopify/Supabase involved.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/access-gate.server.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

process.env["OFFICENEED_ACCESS_GATE_ENABLED"] = "true";
process.env["OFFICENEED_ACCESS_CODE"] = "unit-test-code-456";
process.env["OFFICENEED_ACCESS_GATE_SECRET"] = "unit-test-signing-secret-do-not-use-in-prod";

const { handleAccessGateRequest, isAccessGateEnabled, ACCESS_GATE_VERIFY_PATH } = await import("@/lib/access-gate.server");

function req(path, init = {}) {
  return new Request(`http://localhost${path}`, init);
}

function cookieFrom(response, name) {
  const all = response.headers.getSetCookie ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
  for (const c of all) {
    if (c.startsWith(`${name}=`)) return c.split(";")[0];
  }
  return null;
}

test("isAccessGateEnabled reflects the env toggle exactly", () => {
  assert.equal(isAccessGateEnabled(), true);
  process.env["OFFICENEED_ACCESS_GATE_ENABLED"] = "false";
  assert.equal(isAccessGateEnabled(), false);
  process.env["OFFICENEED_ACCESS_GATE_ENABLED"] = "true";
});

test("a visitor with no session cookie is shown the gate page for the homepage, a product page, and the cart -- never the real app", async () => {
  for (const path of ["/", "/products/some-handle", "/cart", "/products?search=pen"]) {
    const res = await handleAccessGateRequest({ request: req(path), pathname: path.split("?")[0], handlerType: "router" });
    assert.ok(res, `expected a gate response for ${path}`);
    assert.equal(res.status, 401);
    const body = await res.text();
    assert.match(body, /Something exceptional is coming/);
    assert.doesNotMatch(body, /unit-test-code-456/, "the real access code must never appear in the gate page HTML");
    assert.doesNotMatch(body, /unit-test-signing-secret/, "the signing secret must never appear in the gate page HTML");
  }
});

test("an unauthenticated direct hit on a serverFn RPC path gets a minimal response, not the HTML gate page", async () => {
  const res = await handleAccessGateRequest({ request: req("/_serverFn/whatever"), pathname: "/_serverFn/whatever", handlerType: "serverFn" });
  assert.ok(res);
  assert.equal(res.status, 401);
  const body = await res.text();
  assert.doesNotMatch(body, /<html/i);
});

test("an incorrect code is rejected, never sets a session cookie, and preserves the intended destination for the retry", async () => {
  const form = new URLSearchParams({ code: "wrong-code", redirect: "/products/some-handle" });
  const res = await handleAccessGateRequest({
    request: req(ACCESS_GATE_VERIFY_PATH, { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } }),
    pathname: ACCESS_GATE_VERIFY_PATH,
    handlerType: "router",
  });
  assert.ok(res);
  assert.equal(res.status, 401);
  assert.equal(cookieFrom(res, "officeneed_gate_session"), null, "a wrong code must never grant a session");
  const body = await res.text();
  assert.match(body, /access code isn/i);
  assert.match(body, /value="\/products\/some-handle"/, "the original destination must survive a failed attempt");
});

test("the correct code unlocks: sets a session cookie and redirects to the preserved destination; that cookie then grants access", async () => {
  const form = new URLSearchParams({ code: "unit-test-code-456", redirect: "/products/some-handle" });
  const verifyRes = await handleAccessGateRequest({
    request: req(ACCESS_GATE_VERIFY_PATH, { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } }),
    pathname: ACCESS_GATE_VERIFY_PATH,
    handlerType: "router",
  });
  assert.ok(verifyRes);
  assert.equal(verifyRes.status, 303);
  assert.equal(verifyRes.headers.get("location"), "/products/some-handle");
  const sessionCookie = cookieFrom(verifyRes, "officeneed_gate_session");
  assert.ok(sessionCookie, "a correct code must grant a session cookie");

  const unlocked = await handleAccessGateRequest({
    request: req("/cart", { headers: { cookie: sessionCookie } }),
    pathname: "/cart",
    handlerType: "router",
  });
  assert.equal(unlocked, null, "a valid session must let the real app handle the request (gate returns null)");
});

test("a tampered or garbage session cookie is rejected exactly like having none at all", async () => {
  const res = await handleAccessGateRequest({
    request: req("/", { headers: { cookie: "officeneed_gate_session=not.a-real-signed-token" } }),
    pathname: "/",
    handlerType: "router",
  });
  assert.ok(res);
  assert.equal(res.status, 401);
});

test("an open-redirect attempt in the redirect field is rejected and falls back to '/'", async () => {
  for (const malicious of ["https://evil.example/phish", "//evil.example/phish", "http://evil.example"]) {
    const form = new URLSearchParams({ code: "wrong", redirect: malicious });
    const res = await handleAccessGateRequest({
      request: req(ACCESS_GATE_VERIFY_PATH, { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } }),
      pathname: ACCESS_GATE_VERIFY_PATH,
      handlerType: "router",
    });
    const body = await res.text();
    assert.match(body, /value="\/"/, `expected the open-redirect target "${malicious}" to be rejected and fall back to "/"`);
  }
});

test("repeated wrong codes trigger a lockout that blocks even the correct code until it expires", async () => {
  let cookie = "";
  let lastRes;
  for (let i = 0; i < 8; i++) {
    const form = new URLSearchParams({ code: `still-wrong-${i}`, redirect: "/" });
    lastRes = await handleAccessGateRequest({
      request: req(ACCESS_GATE_VERIFY_PATH, {
        method: "POST",
        body: form,
        headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) },
      }),
      pathname: ACCESS_GATE_VERIFY_PATH,
      handlerType: "router",
    });
    const attemptsCookie = cookieFrom(lastRes, "officeneed_gate_attempts");
    if (attemptsCookie) cookie = attemptsCookie;
  }
  assert.equal(lastRes.status, 429, "the 8th attempt must trip the lockout");

  const form = new URLSearchParams({ code: "unit-test-code-456", redirect: "/" });
  const lockedOutEvenWithCorrectCode = await handleAccessGateRequest({
    request: req(ACCESS_GATE_VERIFY_PATH, { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded", cookie } }),
    pathname: ACCESS_GATE_VERIFY_PATH,
    handlerType: "router",
  });
  assert.equal(lockedOutEvenWithCorrectCode.status, 429, "the lockout window must block even a correct code until it expires");
});

test("disabling the gate (OFFICENEED_ACCESS_GATE_ENABLED unset/false) makes every request pass straight through, unchanged", async () => {
  process.env["OFFICENEED_ACCESS_GATE_ENABLED"] = "false";
  try {
    for (const path of ["/", "/cart", "/products/some-handle"]) {
      const res = await handleAccessGateRequest({ request: req(path), pathname: path, handlerType: "router" });
      assert.equal(res, null, `expected ${path} to pass through untouched when the gate is disabled`);
    }
  } finally {
    process.env["OFFICENEED_ACCESS_GATE_ENABLED"] = "true";
  }
});

test("enabling the gate without its secrets configured fails CLOSED (still shows the gate, never the public site)", async () => {
  const savedCode = process.env["OFFICENEED_ACCESS_CODE"];
  delete process.env["OFFICENEED_ACCESS_CODE"];
  try {
    const res = await handleAccessGateRequest({ request: req("/"), pathname: "/", handlerType: "router" });
    assert.ok(res);
    assert.equal(res.status, 503);
    const body = await res.text();
    assert.doesNotMatch(body, /unit-test-signing-secret/);
  } finally {
    process.env["OFFICENEED_ACCESS_CODE"] = savedCode;
  }
});
