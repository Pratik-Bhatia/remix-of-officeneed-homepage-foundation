// Unit tests for src/lib/api4ai-client.server.ts -- the API4AI HTTP
// transport. globalThis.fetch is replaced with a fake for every test, so
// nothing here can reach the real (paid) API.
//
// Run with: npx tsx --test src/lib/api4ai-client.server.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "fast-png";

const { callApi4aiApi, API4AI_ENDPOINT } = await import("./api4ai-client.server");

const KEY = "test-fake-api4ai-key-never-real";
const INPUT = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const OUTPUT_PNG = Uint8Array.from(encode({ width: 2, height: 1, data: new Uint8Array([1, 2, 3, 255, 0, 0, 0, 0]), channels: 4, depth: 8 }));

function okBody(overrides = {}) {
  return {
    results: [{
      status: { code: "ok", message: "Success" },
      width: 600, height: 300,
      entities: [{ kind: "image", name: "RemBgKind.general-RemBgMode.image", image: Buffer.from(OUTPUT_PNG).toString("base64"), format: "PNG" }],
      ...overrides,
    }],
  };
}

/** Installs a fake fetch for the duration of fn and records each call. */
async function withFetch(impl, fn) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return impl(url, init); };
  try { return await fn(calls); } finally { globalThis.fetch = original; }
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("sends POST to the documented endpoint with mode=fg-image, kind=general and the X-API-KEY header", async () => {
  await withFetch(() => json(okBody()), async (calls) => {
    await callApi4aiApi({ apiKey: KEY, imageBytes: INPUT, mimeType: "image/jpeg" });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(`${url.origin}${url.pathname}`, API4AI_ENDPOINT);
    assert.equal(API4AI_ENDPOINT, "https://api4ai.cloud/img-bg-removal/v1/results");
    assert.equal(url.searchParams.get("mode"), "fg-image");
    assert.equal(url.searchParams.get("kind"), "general");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers["X-API-KEY"], KEY);
    assert.ok(calls[0].init.signal, "a timeout signal is always attached");
  });
});

test("builds a multipart body whose `image` field holds the exact input bytes with the sniffed MIME type", async () => {
  await withFetch(() => json(okBody()), async (calls) => {
    await callApi4aiApi({ apiKey: KEY, imageBytes: INPUT, mimeType: "image/jpeg" });
    const body = calls[0].init.body;
    assert.ok(body instanceof FormData);
    const file = body.get("image");
    assert.ok(file instanceof Blob);
    assert.equal(file.type, "image/jpeg");
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [...INPUT]);
    assert.equal(body.get("url"), null, "never sends a URL -- customer files are uploaded directly");
  });
});

test("parses results[0].entities[0].image into PNG bytes and reports width/height and provider", async () => {
  await withFetch(() => json(okBody()), async () => {
    const r = await callApi4aiApi({ apiKey: KEY, imageBytes: INPUT, mimeType: "image/png" });
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
    assert.deepEqual([...new Uint8Array(r.arrayBuffer)], [...OUTPUT_PNG]);
    assert.equal(r.responseWidth, "600");
    assert.equal(r.responseHeight, "300");
    assert.equal(r.responseType, "api4ai");
    assert.equal(r.creditsCharged, null);
  });
});

test("a 200 response whose status.code is 'failure' is a failure, with the provider message kept", async () => {
  await withFetch(() => json(okBody({ status: { code: "failure", message: "Image is too small" }, entities: [] })), async () => {
    const r = await callApi4aiApi({ apiKey: KEY, imageBytes: INPUT, mimeType: "image/png" });
    assert.equal(r.ok, false);
    assert.match(r.errorText, /failure: Image is too small/);
    assert.equal(r.arrayBuffer, undefined);
  });
});

test("HTTP errors (403 missing/invalid key, 429, 500) are failures carrying the HTTP status", async () => {
  for (const status of [403, 429, 500]) {
    await withFetch(() => json({ detail: "API key is required" }, status), async () => {
      const r = await callApi4aiApi({ apiKey: KEY, imageBytes: INPUT, mimeType: "image/png" });
      assert.equal(r.ok, false);
      assert.equal(r.status, status);
    });
  }
});

test("invalid responses are failures: non-JSON, no results, no image entity, non-PNG format, non-PNG bytes, bad base64", async () => {
  const notPng = Buffer.from("this is not a png").toString("base64");
  const cases = [
    new Response("<html>gateway error</html>", { status: 200 }),
    json({}),
    json({ results: [] }),
    json(okBody({ entities: [] })),
    json(okBody({ entities: [{ kind: "image", image: Buffer.from(OUTPUT_PNG).toString("base64"), format: "JPEG" }] })),
    json(okBody({ entities: [{ kind: "image", image: notPng, format: "PNG" }] })),
    json(okBody({ entities: [{ kind: "image", image: "%%%not-base64%%%", format: "PNG" }] })),
  ];
  for (const response of cases) {
    await withFetch(() => response, async () => {
      const r = await callApi4aiApi({ apiKey: KEY, imageBytes: INPUT, mimeType: "image/png" });
      assert.equal(r.ok, false);
      assert.equal(r.arrayBuffer, undefined);
      assert.ok(r.errorText);
    });
  }
});

test("a timeout is reported as status 408 and a network error as 500, without throwing", async () => {
  await withFetch(() => { const e = new Error("aborted"); e.name = "TimeoutError"; throw e; }, async () => {
    const r = await callApi4aiApi({ apiKey: KEY, imageBytes: INPUT, mimeType: "image/png", timeoutMs: 5 });
    assert.equal(r.ok, false);
    assert.equal(r.status, 408);
    assert.match(r.errorText, /timed out after 5ms/);
  });
  await withFetch(() => { throw new Error("ECONNRESET"); }, async () => {
    const r = await callApi4aiApi({ apiKey: KEY, imageBytes: INPUT, mimeType: "image/png" });
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
  });
});

test("an oversized declared response is refused without being parsed", async () => {
  await withFetch(() => new Response("{}", { status: 200, headers: { "Content-Length": String(41 * 1024 * 1024) } }), async () => {
    const r = await callApi4aiApi({ apiKey: KEY, imageBytes: INPUT, mimeType: "image/png" });
    assert.equal(r.ok, false);
    assert.match(r.errorText, /too large/);
  });
});

test("the API key never appears in any returned result, success or failure", async () => {
  for (const response of [json(okBody()), json({ detail: "bad" }, 403), new Response("oops", { status: 200 })]) {
    await withFetch(() => response, async () => {
      const r = await callApi4aiApi({ apiKey: KEY, imageBytes: INPUT, mimeType: "image/png" });
      const { arrayBuffer, ...rest } = r;
      void arrayBuffer;
      assert.ok(!JSON.stringify(rest).includes(KEY));
    });
  }
});
