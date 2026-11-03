// Local (no API call) background removal for the simple, very common case
// of a logo on a plain background, plus a pass-through for logos that are
// already transparent. Anything this module is not confident about is
// reported as "unsuitable" and the caller sends it to the configured
// provider (API4AI) exactly as before.
//
// Why: API4AI's general model treats background-coloured areas that reach
// into a logo (e.g. white swooshes open to the outside) as foreground,
// leaving opaque white patches and torn edges, and every call takes
// seconds. For a flat background, an exact edge-connected fill is both
// correct and fast.
//
// Behaviour (deliberately conservative):
// - Already-transparent PNG (transparent border, visible content): used
//   as-is. The customer's own transparency is never re-processed.
// - Opaque PNG/JPEG with a uniform border: only background CONNECTED TO THE
//   IMAGE BORDER is removed. Background-coloured areas fully enclosed by the
//   logo (the inside of an "O", intentional white artwork) are KEPT, because
//   nothing in the image reliably tells them apart.
// - WebP, partially transparent images, non-uniform borders, photos,
//   gradients, logos touching the border, or implausible results:
//   "unsuitable" -> provider.
//
// Pure JS (fast-png, jpeg-js), so it runs on the Cloudflare Workers
// deployment. Work is bounded: images are processed at most WORK_MAX_SIDE
// on the longest side (the final output is 768px anyway).
import { decode as decodePng } from "fast-png";
import { decode as decodeJpeg } from "jpeg-js";
import type { ValidatedImage } from "@/lib/image-validation.server";
import { downscaleRgba, targetSize, MAX_OUTPUT_LONGEST_SIDE_PX, type Rgba8 } from "@/lib/png-output.server";

/** Cache variant for locally processed results (see computeFingerprint).
 * Distinct from every provider's, and versioned so an algorithm change
 * never serves stale local results. */
export const LOCAL_CACHE_VARIANT = `local:plain-bg:v1:max${MAX_OUTPUT_LONGEST_SIDE_PX}`;

/** Longest side the mask is computed at. ~2.7x the 768px output, so edge
 * quality in the final image is unaffected, while memory stays bounded. */
export const WORK_MAX_SIDE = 2048;

/** jpeg-js limits: a 4096x4096 JPEG (the upload cap) is ~16.8MP. Anything
 * the decoder can't do within these bounds goes to the provider instead. */
const JPEG_MAX_MP = 17;
const JPEG_MAX_MEMORY_MB = 96;

// Background detection / safety thresholds (0-255 per-channel distances).
const BORDER_NOISE_MAX = 24;          // p95 border distance from the bg colour
const PNG_TOLERANCE_FLOOR = 16;       // min distance still counted as background
const JPEG_TOLERANCE_FLOOR = 32;
const BORDER_MATCH_MIN = 0.98;        // share of border pixels that must match the bg
const MIN_REMOVED_FRACTION = 0.03;    // must actually remove some background
const MIN_KEPT_FRACTION = 0.002;      // must keep a visible logo
const MAX_ENCLOSED_BG_SHARE = 0.6;    // kept pixels that are bg-coloured (box/card/frame)
const MAX_LOW_CONTRAST_SHARE = 0.8;   // kept pixels barely different from the bg
const ALPHA_FLOOR = 0.05;             // softer than this -> fully transparent
const ALPHA_CEIL = 0.97;              // harder than this -> fully opaque
const REF_RADIUS = 5;                 // px searched for an edge pixel's true logo colour

export interface LocalStats {
  background: [number, number, number] | null;
  tolerance: number | null;
  removedPct: number;
  keptPct: number;
  enclosedBackgroundPct: number;
  workWidth: number;
  workHeight: number;
}

export type LocalAnalysis =
  | { kind: "transparent"; rgba: Rgba8; stats: LocalStats }
  | { kind: "cutout"; rgba: Rgba8; stats: LocalStats }
  | { kind: "unsuitable"; reason: string };

const unsuitable = (reason: string): LocalAnalysis => ({ kind: "unsuitable", reason });

/** Decodes a validated PNG/JPEG to 8-bit RGBA, or returns a reason it can't. */
function decodeToRgba(image: ValidatedImage): Rgba8 | string {
  if (image.format === "jpeg") {
    try {
      const jpg = decodeJpeg(image.bytes, {
        useTArray: true, formatAsRGBA: true, tolerantDecoding: true,
        maxResolutionInMP: JPEG_MAX_MP, maxMemoryUsageInMB: JPEG_MAX_MEMORY_MB,
      });
      return { width: jpg.width, height: jpg.height, data: jpg.data };
    } catch (err: any) {
      return `JPEG not decodable locally (${err?.message || String(err)})`;
    }
  }
  if (image.format !== "png") return `${image.format} is not decoded locally`;

  let img: ReturnType<typeof decodePng>;
  try {
    img = decodePng(image.bytes);
  } catch (err: any) {
    return `PNG not decodable locally (${err?.message || String(err)})`;
  }
  const { width, height, channels, depth } = img;
  const n = width * height;
  const out = new Uint8Array(n * 4);
  const palette = (img as { palette?: number[][] }).palette;
  if (palette) {
    if (depth !== 8) return `palette PNG with ${depth}-bit indices is not decoded locally`;
    const idx = img.data as Uint8Array;
    for (let p = 0; p < n; p++) {
      const entry = palette[idx[p]!];
      if (!entry) return "palette index out of range";
      out[p * 4] = entry[0]!; out[p * 4 + 1] = entry[1]!; out[p * 4 + 2] = entry[2]!;
      out[p * 4 + 3] = entry.length > 3 ? entry[3]! : 255;
    }
    return { width, height, data: out };
  }
  if (depth !== 8 && depth !== 16) return `${depth}-bit PNG is not decoded locally`;
  if (channels < 1 || channels > 4) return `PNG with ${channels} channels is not decoded locally`;
  const src = img.data as Uint8Array | Uint16Array;
  if (src.length < n * channels) return "decoded PNG data is truncated";
  const shift = depth === 16 ? 8 : 0;
  for (let p = 0; p < n; p++) {
    const i = p * channels, o = p * 4;
    if (channels >= 3) {
      out[o] = src[i]! >> shift; out[o + 1] = src[i + 1]! >> shift; out[o + 2] = src[i + 2]! >> shift;
      out[o + 3] = channels === 4 ? src[i + 3]! >> shift : 255;
    } else {
      const g = src[i]! >> shift;
      out[o] = g; out[o + 1] = g; out[o + 2] = g;
      out[o + 3] = channels === 2 ? src[i + 1]! >> shift : 255;
    }
  }
  return { width, height, data: out };
}

/** Indices of a 2px border ring (each pixel once). */
function borderIndices(width: number, height: number): Int32Array {
  const ring = Math.min(2, Math.floor(Math.min(width, height) / 2)) || 1;
  const list: number[] = [];
  for (let y = 0; y < height; y++) {
    const fullRow = y < ring || y >= height - ring;
    for (let x = 0; x < width; x++) {
      if (!fullRow && x === ring) x = width - ring; // jump over the interior
      list.push(y * width + x);
    }
  }
  return Int32Array.from(list);
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[sorted.length >> 1]!;
}

export function analyzeForLocalRemoval(image: ValidatedImage): LocalAnalysis {
  const decoded = decodeToRgba(image);
  if (typeof decoded === "string") return unsuitable(decoded);
  if (decoded.width < 8 || decoded.height < 8) return unsuitable("image too small to analyse");

  const border = borderIndices(decoded.width, decoded.height);
  const total = decoded.width * decoded.height;

  // --- Transparency: pass through, or hand ambiguous cases to the provider.
  let anyTransparency = false;
  for (let i = 3; i < decoded.data.length; i += 4) {
    if (decoded.data[i]! < 250) { anyTransparency = true; break; }
  }
  if (anyTransparency) {
    let borderClear = 0;
    for (const p of border) if (decoded.data[p * 4 + 3]! < 16) borderClear++;
    let visible = 0;
    for (let i = 3; i < decoded.data.length; i += 4) if (decoded.data[i]! >= 16) visible++;
    if (borderClear / border.length >= 0.9 && visible / total >= MIN_KEPT_FRACTION) {
      return {
        kind: "transparent",
        rgba: decoded,
        stats: {
          background: null, tolerance: null,
          removedPct: round2(100 * (1 - visible / total)), keptPct: round2(100 * visible / total),
          enclosedBackgroundPct: 0, workWidth: decoded.width, workHeight: decoded.height,
        },
      };
    }
    return unsuitable("partially transparent image without a transparent border");
  }

  // --- Work at a bounded size (the output is 768px; this keeps memory low).
  const work = targetSize(decoded.width, decoded.height, WORK_MAX_SIDE);
  const img = work.width !== decoded.width || work.height !== decoded.height
    ? downscaleRgba(decoded, work.width, work.height)
    : decoded;
  const W = img.width, H = img.height, N = W * H, px = img.data;
  const ring = borderIndices(W, H);

  // --- Background colour + noise from the border ring.
  const bg: [number, number, number] = [
    median(Array.from(ring, (p) => px[p * 4]!)),
    median(Array.from(ring, (p) => px[p * 4 + 1]!)),
    median(Array.from(ring, (p) => px[p * 4 + 2]!)),
  ];
  // Per-pixel distance from the background colour, computed once.
  const D = new Uint8Array(N);
  for (let p = 0, o = 0; p < N; p++, o += 4) {
    D[p] = Math.max(Math.abs(px[o]! - bg[0]), Math.abs(px[o + 1]! - bg[1]), Math.abs(px[o + 2]! - bg[2]));
  }
  const borderDist = Array.from(ring, (p) => D[p]!).sort((a, b) => a - b);
  const noise = borderDist[Math.floor(borderDist.length * 0.95)]!;
  if (noise > BORDER_NOISE_MAX) return unsuitable(`background is not uniform (border noise ${noise})`);
  // JPEG compression adds ringing (typically 15-30 levels) next to
  // high-contrast edges even when the border itself is perfectly flat, so
  // JPEGs get a higher floor; PNGs a tighter one.
  const tolFloor = image.format === "jpeg" ? JPEG_TOLERANCE_FLOOR : PNG_TOLERANCE_FLOOR;
  const tol = Math.min(48, Math.max(tolFloor, noise * 2 + 8));
  const borderMatch = borderDist.filter((d) => d <= tol).length / borderDist.length;
  if (borderMatch < BORDER_MATCH_MIN) {
    return unsuitable(`logo or detail touches the image border (${round2(100 * borderMatch)}% border match)`);
  }

  // --- Edge-connected flood fill (4-connected, queue; each pixel once).
  const region = new Uint8Array(N);
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (const p of ring) if (!region[p] && D[p]! <= tol) { region[p] = 1; queue[tail++] = p; }
  while (head < tail) {
    const p = queue[head++]!, x = p % W;
    const tryPush = (q: number) => { if (!region[q] && D[q]! <= tol) { region[q] = 1; queue[tail++] = q; } };
    if (x > 0) tryPush(p - 1);
    if (x < W - 1) tryPush(p + 1);
    if (p >= W) tryPush(p - W);
    if (p < N - W) tryPush(p + W);
  }
  const removed = tail; // every queued pixel is background

  // --- Plausibility checks (each failure -> provider, never a bad cut-out).
  const kept = N - removed;
  if (removed / N < MIN_REMOVED_FRACTION) return unsuitable("almost no background to remove");
  if (kept / N < MIN_KEPT_FRACTION) return unsuitable("almost nothing would be kept (logo may match the background)");
  let enclosedBg = 0, lowContrast = 0;
  for (let p = 0; p < N; p++) {
    if (region[p]) continue;
    const d = D[p]!;
    if (d <= tol) enclosedBg++;
    if (d <= tol * 2) lowContrast++;
  }
  if (enclosedBg / kept > MAX_ENCLOSED_BG_SHARE) {
    return unsuitable("most kept pixels are background-coloured (logo inside a box or frame)");
  }
  if (lowContrast / kept > MAX_LOW_CONTRAST_SHARE) return unsuitable("logo contrast against the background is too low");

  // --- Edge zone: ~2px either side of the background/logo boundary.
  const boundary = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const x = p % W, r = region[p];
    if ((x > 0 && region[p - 1] !== r) || (x < W - 1 && region[p + 1] !== r) ||
        (p >= W && region[p - W] !== r) || (p < N - W && region[p + W] !== r)) boundary[p] = 1;
  }
  const zone = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    if (!boundary[p]) continue;
    const x = p % W, y = (p / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) zone[yy * W + xx] = 1;
    }
  }

  // --- Compose: bg -> transparent; logo -> untouched; edge -> matted.
  const out = new Uint8Array(N * 4);
  for (let p = 0; p < N; p++) {
    const o = p * 4;
    if (!zone[p]) {
      if (!region[p]) { out[o] = px[o]!; out[o + 1] = px[o + 1]!; out[o + 2] = px[o + 2]!; out[o + 3] = 255; }
      continue; // background stays 0,0,0,0
    }
    // True logo colour for this edge pixel: the most logo-like (furthest
    // from the background colour) non-background pixel within REF_RADIUS.
    // Using it as the edge colour removes the background tint, and alpha is
    // the pixel's position between the background and that colour. The
    // radius must exceed the edge zone plus the artwork's own anti-alias
    // ramp, or a faint light fringe gets the wrong (light) reference.
    const x = p % W, y = (p / W) | 0;
    let ref = -1, refD = -1;
    for (let dy = -REF_RADIUS; dy <= REF_RADIUS; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -REF_RADIUS; dx <= REF_RADIUS; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        const q = yy * W + xx;
        if (region[q]) continue;
        if (D[q]! > refD) { refD = D[q]!; ref = q; }
      }
    }
    if (ref < 0 || refD <= tol * 2) continue; // no clear logo colour nearby -> background
    const fr = px[ref * 4]!, fg = px[ref * 4 + 1]!, fb = px[ref * 4 + 2]!;
    const vr = fr - bg[0], vg = fg - bg[1], vb = fb - bg[2];
    const len2 = vr * vr + vg * vg + vb * vb;
    let a = ((px[o]! - bg[0]) * vr + (px[o + 1]! - bg[1]) * vg + (px[o + 2]! - bg[2]) * vb) / len2;
    if (!Number.isFinite(a)) a = region[p] ? 0 : 1;
    if (a < ALPHA_FLOOR) continue;
    if (a > ALPHA_CEIL) a = 1;
    if (a >= 1 && !region[p]) {
      out[o] = px[o]!; out[o + 1] = px[o + 1]!; out[o + 2] = px[o + 2]!; out[o + 3] = 255;
    } else {
      out[o] = fr; out[o + 1] = fg; out[o + 2] = fb; out[o + 3] = Math.round(a * 255);
    }
  }

  return {
    kind: "cutout",
    rgba: { width: W, height: H, data: out },
    stats: {
      background: bg, tolerance: tol,
      removedPct: round2(100 * removed / N), keptPct: round2(100 * kept / N),
      enclosedBackgroundPct: round2(100 * enclosedBg / N), workWidth: W, workHeight: H,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
