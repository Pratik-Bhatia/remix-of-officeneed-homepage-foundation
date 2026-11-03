// Turns a provider's background-removed PNG into the two images the
// customizer uses: the UV preview (the cut-out itself) and the laser
// preview (same cut-out, recoloured to a silver tone). Provider-neutral:
// every provider's output goes through here.
//
// Why it exists: remove.bg was asked for `size=small` (<= ~0.25MP), but
// API4AI has no output-size option and returns the input's full size (up to
// the 4096x4096 upload cap). Uncapped, that would put multi-MB data URLs in
// logo_processing_cache rows, in every server-function response, and in the
// browser's preview/measure/snapshot steps. So outputs are validated and
// downscaled here to at most MAX_OUTPUT_LONGEST_SIDE_PX before caching.
//
// Uses only libraries this project already ships (fast-png, image-size);
// pure JS, so it runs on the Cloudflare Workers deployment.
import { decode, encode } from "fast-png";
import { imageSize } from "image-size";
import { MAX_DIMENSION_PX } from "@/lib/image-validation.server";

/** Longest side of the cached/returned logo images. Roughly remove.bg's
 * former `small` output, which the customizer was built around. Changing it
 * changes API4AI's cache variant (see background-removal-providers.server). */
export const MAX_OUTPUT_LONGEST_SIDE_PX = 768;

/** Upper bound on a provider PNG we are willing to decode at all. */
export const MAX_PROVIDER_OUTPUT_BYTES = 30 * 1024 * 1024;

export interface LogoOutputImages {
  uvPng: Uint8Array;
  laserPng: Uint8Array;
  width: number;
  height: number;
  resized: boolean;
}

export type LogoOutputResult = { ok: true; images: LogoOutputImages } | { ok: false; error: string };

export interface Rgba8 {
  width: number;
  height: number;
  data: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Expands a decoded PNG to 8-bit RGBA. Only formats that carry an alpha
 * channel are accepted: a background-removal result without alpha has no
 * transparency and is treated as an invalid output, never passed off as
 * a cut-out. */
function toRgba8(img: ReturnType<typeof decode>): Rgba8 | string {
  const { width, height, channels, depth } = img;
  if (channels !== 4 && channels !== 2) {
    return `provider PNG has no alpha channel (channels=${channels})`;
  }
  if (depth !== 8 && depth !== 16) {
    return `unsupported PNG bit depth ${depth}`;
  }
  const src = img.data as Uint8Array | Uint16Array;
  const pixelCount = width * height;
  if (src.length < pixelCount * channels) {
    return "decoded PNG data is truncated";
  }
  if (channels === 4 && depth === 8) {
    return { width, height, data: src as Uint8Array };
  }
  const shift = depth === 16 ? 8 : 0;
  const out = new Uint8Array(pixelCount * 4);
  for (let p = 0; p < pixelCount; p++) {
    const o = p * 4;
    if (channels === 4) {
      out[o] = src[o]! >> shift;
      out[o + 1] = src[o + 1]! >> shift;
      out[o + 2] = src[o + 2]! >> shift;
      out[o + 3] = src[o + 3]! >> shift;
    } else {
      const g = src[p * 2]! >> shift;
      out[o] = g;
      out[o + 1] = g;
      out[o + 2] = g;
      out[o + 3] = src[p * 2 + 1]! >> shift;
    }
  }
  return { width, height, data: out };
}

/** Area-average downscale in premultiplied-alpha space: colour is weighted
 * by alpha, so fully-transparent (often black) background pixels never
 * bleed a dark fringe into the logo's edges, and alpha itself is averaged
 * so soft edges stay soft. One pass over the source; O(source pixels). */
export function downscaleRgba(src: Rgba8, targetWidth: number, targetHeight: number): Rgba8 {
  const { width: sw, height: sh, data } = src;
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  const xStart = new Int32Array(targetWidth);
  const xEnd = new Int32Array(targetWidth);
  for (let dx = 0; dx < targetWidth; dx++) {
    const x0 = Math.floor((dx * sw) / targetWidth);
    xStart[dx] = x0;
    xEnd[dx] = Math.max(x0 + 1, Math.min(sw, Math.floor(((dx + 1) * sw) / targetWidth)));
  }
  for (let dy = 0; dy < targetHeight; dy++) {
    const y0 = Math.floor((dy * sh) / targetHeight);
    const y1 = Math.max(y0 + 1, Math.min(sh, Math.floor(((dy + 1) * sh) / targetHeight)));
    for (let dx = 0; dx < targetWidth; dx++) {
      const x0 = xStart[dx]!;
      const x1 = xEnd[dx]!;
      let sumA = 0, sumR = 0, sumG = 0, sumB = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * sw + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          const a = data[i + 3]!;
          sumA += a;
          sumR += data[i]! * a;
          sumG += data[i + 1]! * a;
          sumB += data[i + 2]! * a;
          n++;
        }
      }
      const o = (dy * targetWidth + dx) * 4;
      if (sumA > 0) {
        out[o] = Math.round(sumR / sumA);
        out[o + 1] = Math.round(sumG / sumA);
        out[o + 2] = Math.round(sumB / sumA);
      }
      out[o + 3] = Math.round(sumA / n);
    }
  }
  return { width: targetWidth, height: targetHeight, data: out };
}

/** The laser-preview recolour, unchanged from the original inline version
 * in logo-processing-core.server.ts: every non-transparent pixel becomes a
 * luminance-mapped silver; alpha is untouched. */
function toLaser(src: Rgba8): Rgba8 {
  const data = new Uint8Array(src.data);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! > 0) {
      const luminance = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      const silverBase = Math.floor(160 + (luminance / 255) * 60);
      data[i] = silverBase;
      data[i + 1] = silverBase;
      data[i + 2] = silverBase;
    }
  }
  return { width: src.width, height: src.height, data };
}

function encodeRgba(img: Rgba8): Uint8Array {
  return encode({ width: img.width, height: img.height, data: img.data, channels: 4, depth: 8 });
}

export function targetSize(width: number, height: number, maxSide = MAX_OUTPUT_LONGEST_SIDE_PX): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function buildLogoOutputs(pngBytes: Uint8Array): LogoOutputResult {
  if (pngBytes.length === 0) return { ok: false, error: "provider returned an empty image" };
  if (pngBytes.length > MAX_PROVIDER_OUTPUT_BYTES) {
    return { ok: false, error: `provider image too large (${pngBytes.length} bytes)` };
  }
  if (pngBytes.length < 8 || !PNG_SIGNATURE.every((b, i) => pngBytes[i] === b)) {
    return { ok: false, error: "provider image is not a PNG" };
  }

  // Header-only dimension check BEFORE decoding, so an unexpectedly huge
  // result is refused without allocating its full pixel buffer.
  let header: ReturnType<typeof imageSize>;
  try {
    header = imageSize(pngBytes);
  } catch {
    return { ok: false, error: "provider PNG header is unreadable" };
  }
  if (header.type !== "png" || !header.width || !header.height) {
    return { ok: false, error: "provider PNG header is invalid" };
  }
  if (header.width > MAX_DIMENSION_PX || header.height > MAX_DIMENSION_PX) {
    return { ok: false, error: `provider image dimensions too large (${header.width}x${header.height})` };
  }

  let decoded: ReturnType<typeof decode>;
  try {
    decoded = decode(pngBytes);
  } catch (err: any) {
    return { ok: false, error: `provider PNG could not be decoded: ${err?.message || String(err)}` };
  }
  const rgba = toRgba8(decoded);
  if (typeof rgba === "string") return { ok: false, error: rgba };

  // An already-small 8-bit RGBA result is passed through byte-for-byte as
  // the UV image (exactly what the pre-provider code did with remove.bg's
  // response); anything converted or resized is re-encoded.
  const canPassThrough = decoded.channels === 4 && decoded.depth === 8;
  return finishOutputs(rgba, canPassThrough ? pngBytes : null);
}

/** Same as buildLogoOutputs, for a cut-out that is already decoded 8-bit
 * RGBA (the local background-removal path), so it isn't PNG-encoded and
 * re-decoded just to reach the identical resize + laser step. */
export function buildLogoOutputsFromRgba(rgba: Rgba8): LogoOutputResult {
  if (rgba.width <= 0 || rgba.height <= 0 || rgba.data.length < rgba.width * rgba.height * 4) {
    return { ok: false, error: "cut-out pixel data is invalid" };
  }
  if (rgba.width > MAX_DIMENSION_PX || rgba.height > MAX_DIMENSION_PX) {
    return { ok: false, error: `cut-out dimensions too large (${rgba.width}x${rgba.height})` };
  }
  return finishOutputs(rgba, null);
}

function finishOutputs(rgba: Rgba8, passThroughPng: Uint8Array | null): LogoOutputResult {
  const target = targetSize(rgba.width, rgba.height);
  const resized = target.width !== rgba.width || target.height !== rgba.height;
  const finalImage = resized ? downscaleRgba(rgba, target.width, target.height) : rgba;
  const uvPng = !resized && passThroughPng ? passThroughPng : encodeRgba(finalImage);
  const laserPng = encodeRgba(toLaser(finalImage));
  return { ok: true, images: { uvPng, laserPng, width: finalImage.width, height: finalImage.height, resized } };
}
