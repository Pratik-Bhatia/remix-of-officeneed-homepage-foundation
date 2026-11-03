// Unit tests for src/lib/png-output.server.ts -- provider-output
// validation, RGBA normalisation, the 768px downscale and the laser recolour.
//
// Run with: npx tsx --test src/lib/png-output.server.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, decode } from "fast-png";

const { buildLogoOutputs, targetSize, MAX_OUTPUT_LONGEST_SIDE_PX } = await import("./png-output.server");

function png(width, height, channels, depth, pixel) {
  const Arr = depth === 16 ? Uint16Array : Uint8Array;
  const data = new Arr(width * height * channels);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data.set(pixel(x, y), (y * width + x) * channels);
  }
  return Uint8Array.from(encode({ width, height, data, channels, depth }));
}

const px = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

test("the cap is 768px", () => {
  assert.equal(MAX_OUTPUT_LONGEST_SIDE_PX, 768);
  assert.deepEqual(targetSize(600, 300), { width: 600, height: 300 });
  assert.deepEqual(targetSize(4096, 2048), { width: 768, height: 384 });
  assert.deepEqual(targetSize(1000, 4000), { width: 192, height: 768 });
  assert.deepEqual(targetSize(5000, 1), { width: 768, height: 1 });
});

test("a small 8-bit RGBA output passes through byte-for-byte as the UV image (unchanged pre-migration behaviour)", () => {
  const input = png(3, 2, 4, 8, (x) => (x === 0 ? [0, 0, 0, 0] : [255, 0, 0, 255]));
  const r = buildLogoOutputs(input);
  assert.equal(r.ok, true);
  assert.equal(r.images.resized, false);
  assert.deepEqual([...r.images.uvPng], [...input]);
  assert.equal(r.images.width, 3);
  assert.equal(r.images.height, 2);
});

test("the laser image is the original silver recolour: opaque pixels become luminance-mapped grey, alpha untouched", () => {
  const r = buildLogoOutputs(png(2, 1, 4, 8, (x) => (x === 0 ? [255, 255, 255, 200] : [9, 9, 9, 0])));
  const laser = decode(r.images.laserPng);
  // white: 160 + 60 = 220; alpha 200 preserved
  assert.deepEqual(px(laser, 0, 0), [220, 220, 220, 200]);
  // fully transparent pixel left exactly as it was
  assert.deepEqual(px(laser, 1, 0), [9, 9, 9, 0]);
});

test("a large output is downscaled to 768px with transparency preserved and no dark fringe from transparent pixels", () => {
  // 2048x1024: left half opaque red, right half TRANSPARENT BLACK
  const r = buildLogoOutputs(png(2048, 1024, 4, 8, (x) => (x < 1024 ? [200, 30, 40, 255] : [0, 0, 0, 0])));
  assert.equal(r.ok, true);
  assert.equal(r.images.resized, true);
  const uv = decode(r.images.uvPng);
  assert.equal(uv.width, 768); assert.equal(uv.height, 384);
  assert.equal(uv.channels, 4); assert.equal(uv.depth, 8);
  assert.deepEqual(px(uv, 100, 100), [200, 30, 40, 255]);
  assert.equal(px(uv, 700, 100)[3], 0);
  // every partially/fully visible pixel keeps the logo colour (premultiplied average)
  for (let x = 380; x < 390; x++) {
    const [rr, gg, bb, aa] = px(uv, x, 100);
    if (aa > 0) assert.deepEqual([rr, gg, bb], [200, 30, 40], `no dark fringe at x=${x}`);
  }
  const laser = decode(r.images.laserPng);
  assert.equal(laser.width, 768);
});

test("a soft (semi-transparent) edge stays semi-transparent after downscaling", () => {
  // alternating opaque / transparent columns average to ~50% alpha at 2x reduction
  const r = buildLogoOutputs(png(1536, 4, 4, 8, (x) => (x % 2 === 0 ? [0, 100, 0, 255] : [0, 0, 0, 0])));
  const uv = decode(r.images.uvPng);
  assert.equal(uv.width, 768);
  const [, g, , a] = px(uv, 10, 1);
  assert.equal(g, 100);
  assert.ok(a > 100 && a < 155, `alpha ${a} should be ~128`);
});

test("16-bit RGBA and 8-bit grey+alpha outputs are normalised to 8-bit RGBA", () => {
  const r16 = buildLogoOutputs(png(2, 1, 4, 16, () => [65535, 0, 32768, 65535]));
  assert.equal(r16.ok, true);
  const uv16 = decode(r16.images.uvPng);
  assert.equal(uv16.depth, 8); assert.equal(uv16.channels, 4);
  assert.deepEqual(px(uv16, 0, 0), [255, 0, 128, 255]);

  const ga = buildLogoOutputs(png(2, 1, 2, 8, (x) => (x === 0 ? [90, 255] : [0, 0])));
  assert.equal(ga.ok, true);
  const uvGa = decode(ga.images.uvPng);
  assert.equal(uvGa.channels, 4);
  assert.deepEqual(px(uvGa, 0, 0), [90, 90, 90, 255]);
  assert.equal(px(uvGa, 1, 0)[3], 0);
});

test("an output with no alpha channel (RGB) is rejected -- it is not a background-removed image", () => {
  const r = buildLogoOutputs(png(2, 2, 3, 8, () => [255, 255, 255]));
  assert.equal(r.ok, false);
  assert.match(r.error, /no alpha channel/);
});

test("empty, non-PNG, truncated and corrupt outputs are rejected without throwing", () => {
  const good = png(4, 4, 4, 8, () => [1, 2, 3, 255]);
  for (const bytes of [
    new Uint8Array(0),
    Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0]),
    good.slice(0, 20),
    Uint8Array.from([...good.slice(0, 40), ...new Uint8Array(30).fill(7)]),
  ]) {
    const r = buildLogoOutputs(bytes);
    assert.equal(r.ok, false, `should reject ${bytes.length}-byte input`);
    assert.ok(r.error);
  }
});

test("a PNG whose header declares dimensions over 4096px is refused before any pixel decoding", () => {
  // Valid signature + IHDR declaring 5000x5000; no pixel data at all. If this
  // were decoded it would fail differently -- the header check must win.
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(5000, 0); ihdr.writeUInt32BE(5000, 4); ihdr[8] = 8; ihdr[9] = 6;
  const len = Buffer.alloc(4); len.writeUInt32BE(13, 0);
  const bytes = Uint8Array.from(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), len, Buffer.from("IHDR"), ihdr, Buffer.alloc(4)]));
  const r = buildLogoOutputs(bytes);
  assert.equal(r.ok, false);
  assert.match(r.error, /dimensions too large \(5000x5000\)/);
});
