// Tests for src/lib/local-background-removal.server.ts -- local removal of
// plain backgrounds, already-transparent pass-through, and every safeguard
// that routes uncertain images to the provider instead.
//
// Run with: npx tsx --test src/lib/local-background-removal.server.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode as encodePng } from "fast-png";
import jpeg from "jpeg-js";

const { analyzeForLocalRemoval, LOCAL_CACHE_VARIANT, WORK_MAX_SIDE } = await import("./local-background-removal.server");

const WHITE = [255, 255, 255];
const BLACK = [10, 10, 10];

/** RGB canvas; paint(x, y) returns a colour or null (= background). Shapes
 * are supersampled 4x4 so edges are anti-aliased like real logo artwork. */
function canvas(w, h, bg, paint) {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const c = paint(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4) ?? bg;
      r += c[0]; g += c[1]; b += c[2];
    }
    const o = (y * w + x) * 3;
    data[o] = Math.round(r / 16); data[o + 1] = Math.round(g / 16); data[o + 2] = Math.round(b / 16);
  }
  return { w, h, data };
}
const asPng = ({ w, h, data }) => ({ bytes: Uint8Array.from(encodePng({ width: w, height: h, data, channels: 3, depth: 8 })), format: "png", width: w, height: h });
function asJpeg({ w, h, data }, quality = 85) {
  const rgba = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) { rgba[p * 4] = data[p * 3]; rgba[p * 4 + 1] = data[p * 3 + 1]; rgba[p * 4 + 2] = data[p * 3 + 2]; rgba[p * 4 + 3] = 255; }
  const enc = jpeg.encode({ width: w, height: h, data: rgba }, quality);
  return { bytes: Uint8Array.from(enc.data), format: "jpeg", width: w, height: h };
}
const px = (rgba, x, y) => [...rgba.data.slice((y * rgba.width + x) * 4, (y * rgba.width + x) * 4 + 4)];
function countOpaqueWhite(rgba) {
  let n = 0;
  for (let i = 0; i < rgba.data.length; i += 4) if (rgba.data[i + 3] > 200 && rgba.data[i] > 230 && rgba.data[i + 1] > 230 && rgba.data[i + 2] > 230) n++;
  return n;
}

// Leaf-like shape with a background-coloured channel that OPENS TO THE
// OUTSIDE on the left -- the same structure as the swooshes in the real
// customer logo that API4AI left as opaque white.
const leafWithOpenChannel = (x, y) => {
  const inLeaf = ((x - 200) / 150) ** 2 + ((y - 150) / 90) ** 2 <= 1;
  const inChannel = x < 300 && Math.abs(y - (150 + 18 * Math.sin(x / 40))) < 12;
  return inLeaf && !inChannel ? BLACK : null;
};

test("cache variant is distinct and versioned", () => {
  assert.match(LOCAL_CACHE_VARIANT, /^local:plain-bg:v1:max768$/);
});

test("background connected to the border -- including a channel cut into the logo -- becomes transparent; the logo stays opaque", () => {
  const r = analyzeForLocalRemoval(asPng(canvas(400, 300, WHITE, leafWithOpenChannel)));
  assert.equal(r.kind, "cutout");
  assert.deepEqual(px(r.rgba, 5, 5), [0, 0, 0, 0], "outer background");
  assert.equal(px(r.rgba, 150, Math.round(150 + 18 * Math.sin(150 / 40)))[3], 0, "channel open to the outside is removed");
  assert.deepEqual(px(r.rgba, 200, 100), [...BLACK, 255], "logo body untouched");
  assert.equal(countOpaqueWhite(r.rgba), 0, "no opaque white left anywhere");
});

test("background-coloured areas ENCLOSED by the logo are preserved (not guessed away)", () => {
  // black ring: the white hole is fully enclosed
  const ring = (x, y) => { const d = Math.hypot(x - 150, y - 150); return d <= 100 && d >= 60 ? BLACK : null; };
  const r = analyzeForLocalRemoval(asPng(canvas(300, 300, WHITE, ring)));
  assert.equal(r.kind, "cutout");
  assert.deepEqual(px(r.rgba, 150, 150), [255, 255, 255, 255], "enclosed white kept as artwork");
  assert.equal(px(r.rgba, 3, 3)[3], 0);
  assert.ok(r.stats.enclosedBackgroundPct > 0);
});

test("anti-aliased edges keep soft alpha and are colour-decontaminated (no white fringe)", () => {
  const disc = (x, y) => (Math.hypot(x - 100, y - 100) <= 60 ? BLACK : null);
  const r = analyzeForLocalRemoval(asPng(canvas(200, 200, WHITE, disc)));
  assert.equal(r.kind, "cutout");
  let soft = 0;
  for (let i = 0; i < r.rgba.data.length; i += 4) {
    const a = r.rgba.data[i + 3];
    if (a > 0 && a < 255) {
      soft++;
      assert.ok(r.rgba.data[i] < 40 && r.rgba.data[i + 1] < 40 && r.rgba.data[i + 2] < 40, "edge pixel colour is the logo colour, not a white blend");
    }
  }
  assert.ok(soft > 50, `expected a soft anti-aliased edge, got ${soft} pixels`);
});

test("coloured plain backgrounds work too (white logo on blue)", () => {
  const blue = [30, 60, 200];
  const r = analyzeForLocalRemoval(asPng(canvas(300, 200, blue, (x, y) => (x > 80 && x < 220 && y > 60 && y < 140 ? WHITE : null))));
  assert.equal(r.kind, "cutout");
  assert.equal(px(r.rgba, 5, 5)[3], 0);
  assert.deepEqual(px(r.rgba, 150, 100), [255, 255, 255, 255]);
});

test("a JPEG with a plain background is handled locally despite compression noise", () => {
  const r = analyzeForLocalRemoval(asJpeg(canvas(400, 300, WHITE, leafWithOpenChannel)));
  assert.equal(r.kind, "cutout");
  assert.equal(px(r.rgba, 5, 5)[3], 0);
  assert.equal(px(r.rgba, 150, Math.round(150 + 18 * Math.sin(150 / 40)))[3], 0);
  const body = px(r.rgba, 200, 100);
  assert.equal(body[3], 255);
  assert.ok(body[0] < 40);
  assert.equal(countOpaqueWhite(r.rgba), 0);
});

test("an already-transparent PNG is passed through untouched", () => {
  const w = 120, h = 80, data = new Uint8Array(w * h * 4);
  for (let y = 20; y < 60; y++) for (let x = 30; x < 90; x++) data.set([200, 30, 40, x === 30 ? 128 : 255], (y * w + x) * 4);
  const bytes = Uint8Array.from(encodePng({ width: w, height: h, data, channels: 4, depth: 8 }));
  const r = analyzeForLocalRemoval({ bytes, format: "png", width: w, height: h });
  assert.equal(r.kind, "transparent");
  assert.deepEqual([...r.rgba.data], [...data], "pixels identical, including the customer's own soft edge");
});

test("safeguard: a partially transparent image WITHOUT a transparent border goes to the provider", () => {
  const w = 100, h = 100, data = new Uint8Array(w * h * 4).fill(255);
  for (let y = 40; y < 60; y++) for (let x = 40; x < 60; x++) data[(y * w + x) * 4 + 3] = 0;
  const bytes = Uint8Array.from(encodePng({ width: w, height: h, data, channels: 4, depth: 8 }));
  const r = analyzeForLocalRemoval({ bytes, format: "png", width: w, height: h });
  assert.equal(r.kind, "unsuitable");
  assert.match(r.reason, /partially transparent/);
});

test("safeguard: photographs / gradients / noisy backgrounds go to the provider", () => {
  const gradient = canvas(300, 200, WHITE, (x, y) => [Math.round(x * 0.8), Math.round(y), 120]);
  const r = analyzeForLocalRemoval(asPng(gradient));
  assert.equal(r.kind, "unsuitable");
  assert.match(r.reason, /not uniform|touches the image border/);

  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const noisy = canvas(200, 200, WHITE, () => { const v = 140 + Math.round(rand() * 100); return [v, v, v]; });
  assert.equal(analyzeForLocalRemoval(asPng(noisy)).kind, "unsuitable");
});

test("safeguard: a logo that touches or is cut by the image border goes to the provider", () => {
  const r = analyzeForLocalRemoval(asPng(canvas(300, 200, WHITE, (x, y) => (y > 80 && y < 120 ? BLACK : null))));
  assert.equal(r.kind, "unsuitable");
  assert.match(r.reason, /touches the image border|not uniform/);
});

test("safeguard: a logo that (nearly) matches the background is never cut out locally", () => {
  const faint = canvas(300, 200, WHITE, (x, y) => (Math.hypot(x - 150, y - 100) < 50 ? [246, 246, 246] : null));
  const r = analyzeForLocalRemoval(asPng(faint));
  assert.equal(r.kind, "unsuitable");
  assert.match(r.reason, /nothing would be kept|almost no background|contrast/);
});

test("safeguard: a logo inside a bg-coloured box/frame goes to the provider instead of keeping a big white card", () => {
  const framed = (x, y) => {
    const inFrame = x > 20 && x < 280 && y > 20 && y < 180;
    const inCard = x > 24 && x < 276 && y > 24 && y < 176;
    if (inFrame && !inCard) return BLACK;
    if (Math.hypot(x - 150, y - 100) < 20) return BLACK;
    return null;
  };
  const r = analyzeForLocalRemoval(asPng(canvas(300, 200, WHITE, framed)));
  assert.equal(r.kind, "unsuitable");
  assert.match(r.reason, /box or frame/);
});

test("WebP and undecodable inputs go to the provider", () => {
  assert.equal(analyzeForLocalRemoval({ bytes: new Uint8Array(20), format: "webp", width: 10, height: 10 }).kind, "unsuitable");
  assert.equal(analyzeForLocalRemoval({ bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0, 1, 2]), format: "jpeg", width: 10, height: 10 }).kind, "unsuitable");
});

test("large inputs are processed at a bounded working size", () => {
  const big = canvas(3000, 1200, WHITE, (x, y) => (Math.hypot(x - 1500, y - 600) < 400 ? BLACK : null));
  const r = analyzeForLocalRemoval(asPng(big));
  assert.equal(r.kind, "cutout");
  assert.equal(r.rgba.width, WORK_MAX_SIDE);
  assert.equal(r.rgba.height, Math.round(1200 * WORK_MAX_SIDE / 3000));
  assert.equal(px(r.rgba, 1024, 410)[3], 255);
  assert.equal(px(r.rgba, 10, 10)[3], 0);
});

test("a WIDE anti-alias ramp (real artwork) leaves no light fringe: every soft edge pixel takes the logo colour", () => {
  // disc whose edge fades from black to white over ~4px, like scaled/exported logos
  const ramp = (x, y) => {
    const d = Math.hypot(x - 150, y - 100) - 60;
    if (d <= -2) return BLACK;
    if (d >= 2) return null;
    const t = (d + 2) / 4, v = Math.round(10 + t * 245);
    return [v, v, v];
  };
  const r = analyzeForLocalRemoval(asPng(canvas(300, 200, WHITE, ramp)));
  assert.equal(r.kind, "cutout");
  let soft = 0, light = 0;
  for (let i = 0; i < r.rgba.data.length; i += 4) {
    const a = r.rgba.data[i + 3];
    if (a > 0 && a < 255) { soft++; if (r.rgba.data[i] > 60) light++; }
  }
  assert.ok(soft > 100, "edge stays soft");
  assert.equal(light, 0, "no light-grey fringe pixels");
});
