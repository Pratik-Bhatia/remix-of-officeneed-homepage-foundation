// Hand-built image headers for the review-photo tests (not a test file).
// Minimal, structurally valid image headers (enough for inspectImage).
export function pngBytes(w, h) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], 0);
  b.set([...Buffer.from("IHDR")], 12);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
export function jpegBytes(w, h) {
  // SOI, an APP0 (JFIF) segment to skip, then SOF0 with height/width.
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}
export function webpVp8xBytes(w, h, animated = false) {
  const b = new Uint8Array(30);
  b.set([...Buffer.from("RIFF")], 0);
  b.set([...Buffer.from("WEBP")], 8);
  b.set([...Buffer.from("VP8X")], 12);
  b[20] = animated ? 0x02 : 0;
  const w1 = w - 1, h1 = h - 1;
  b.set([w1 & 0xff, (w1 >> 8) & 0xff, (w1 >> 16) & 0xff, h1 & 0xff, (h1 >> 8) & 0xff, (h1 >> 16) & 0xff], 24);
  return b;
}
export function webpVp8Bytes(w, h) {
  const b = new Uint8Array(30);
  b.set([...Buffer.from("RIFF")], 0);
  b.set([...Buffer.from("WEBP")], 8);
  b.set([...Buffer.from("VP8 ")], 12);
  b.set([0x9d, 0x01, 0x2a, w & 0xff, (w >> 8) & 0x3f, h & 0xff, (h >> 8) & 0x3f], 23);
  return b;
}
export function webpVp8lBytes(w, h) {
  const b = new Uint8Array(30);
  b.set([...Buffer.from("RIFF")], 0);
  b.set([...Buffer.from("WEBP")], 8);
  b.set([...Buffer.from("VP8L")], 12);
  const w1 = w - 1, h1 = h - 1;
  b[20] = 0x2f;
  b[21] = w1 & 0xff;
  b[22] = ((w1 >> 8) & 0x3f) | ((h1 & 0x03) << 6);
  b[23] = (h1 >> 2) & 0xff;
  b[24] = (h1 >> 10) & 0x0f;
  return b;
}
