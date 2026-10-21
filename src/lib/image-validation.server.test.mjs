// Run with: npx tsx --test src/lib/image-validation.server.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUploadedImage, MAX_UPLOAD_BYTES, MAX_DIMENSION_PX } from "./image-validation.server";

// Minimal, hand-constructed fixtures -- just enough header bytes for
// image-size to report width/height without needing real pixel data
// (verified empirically against the actual image-size package before
// writing these: it does not validate PNG CRC32s, and its JPEG scanner
// requires a leading dummy segment before the first SOF marker it reads).

function makePng(width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  const type = Buffer.from("IHDR");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13, 0);
  const crc = Buffer.from([0, 0, 0, 0]); // unchecked by image-size
  return Buffer.concat([sig, length, type, ihdrData, crc]);
}

function makeJpeg(width, height) {
  const soi = Buffer.from([0xff, 0xd8]);
  const app0Marker = Buffer.from([0xff, 0xe0]);
  const app0Length = Buffer.from([0x00, 0x02]);
  const sof0Marker = Buffer.from([0xff, 0xc0]);
  const data = Buffer.alloc(8);
  data.writeUInt16BE(11, 0);
  data[2] = 8;
  data.writeUInt16BE(height, 3);
  data.writeUInt16BE(width, 5);
  data[7] = 1;
  const compInfo = Buffer.from([1, 0x11, 0]);
  return Buffer.concat([soi, app0Marker, app0Length, sof0Marker, data, compInfo]);
}

function makeWebp(width, height) {
  const payload = Buffer.alloc(10);
  payload[0] = 0x10;
  const w = width - 1, h = height - 1;
  payload[4] = w & 0xff; payload[5] = (w >> 8) & 0xff; payload[6] = (w >> 16) & 0xff;
  payload[7] = h & 0xff; payload[8] = (h >> 8) & 0xff; payload[9] = (h >> 16) & 0xff;
  const chunkHeader = Buffer.from("VP8X");
  const chunkSize = Buffer.alloc(4);
  chunkSize.writeUInt32LE(payload.length, 0);
  const webpChunk = Buffer.concat([chunkHeader, chunkSize, payload]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(4 + webpChunk.length, 0);
  return Buffer.concat([Buffer.from("RIFF"), riffSize, Buffer.from("WEBP"), webpChunk]);
}

test("valid PNG within limits is accepted", () => {
  const result = validateUploadedImage(makePng(100, 50));
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.image.format, "png");
    assert.equal(result.image.width, 100);
    assert.equal(result.image.height, 50);
  }
});

test("valid JPEG within limits is accepted", () => {
  const result = validateUploadedImage(makeJpeg(200, 150));
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.image.format, "jpeg");
});

test("valid WebP within limits is accepted", () => {
  const result = validateUploadedImage(makeWebp(300, 300));
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.image.format, "webp");
});

test("empty file is rejected", () => {
  const result = validateUploadedImage(new Uint8Array(0));
  assert.equal(result.valid, false);
});

test("a file exceeding MAX_UPLOAD_BYTES is rejected without ever decoding it", () => {
  const oversized = new Uint8Array(MAX_UPLOAD_BYTES + 1);
  const result = validateUploadedImage(oversized);
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.error, /5MB/);
});

test("random bytes that match no known image signature are rejected", () => {
  const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const result = validateUploadedImage(junk);
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.error, /format/i);
});

test("a file that sniffs as PNG by magic bytes but has a corrupt/truncated header is rejected, not silently accepted", () => {
  const truncated = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const result = validateUploadedImage(truncated);
  assert.equal(result.valid, false);
});

test("dimensions exactly at MAX_DIMENSION_PX are accepted (inclusive boundary)", () => {
  const result = validateUploadedImage(makePng(MAX_DIMENSION_PX, MAX_DIMENSION_PX));
  assert.equal(result.valid, true);
});

test("width one pixel over MAX_DIMENSION_PX is rejected", () => {
  const result = validateUploadedImage(makePng(MAX_DIMENSION_PX + 1, 100));
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.error, /too large/i);
});

test("height one pixel over MAX_DIMENSION_PX is rejected", () => {
  const result = validateUploadedImage(makePng(100, MAX_DIMENSION_PX + 1));
  assert.equal(result.valid, false);
});

test("a 4096x4096 WebP (a realistic large-but-valid upload) is accepted", () => {
  const result = validateUploadedImage(makeWebp(MAX_DIMENSION_PX, MAX_DIMENSION_PX));
  assert.equal(result.valid, true);
});

test("a 5000x4000 JPEG is rejected for exceeding MAX_DIMENSION_PX", () => {
  const result = validateUploadedImage(makeJpeg(5000, 4000));
  assert.equal(result.valid, false);
});
