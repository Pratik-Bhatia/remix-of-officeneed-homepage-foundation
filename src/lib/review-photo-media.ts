/**
 * Review photo helpers for the storefront: preparing a picked file for
 * upload, and loading approved photos for display. The server (Cloudflare
 * runtime, no native image library) re-validates everything it receives;
 * see review-photos.functions.ts.
 *
 * Safe to import during SSR (no browser API is touched at import time),
 * but the functions themselves use browser APIs (canvas, createImageBitmap)
 * and are only ever called from effects and event handlers.
 */
import {
  ACCEPTED_PHOTO_TYPES,
  FULL_PHOTO_MAX_EDGE,
  FULL_PHOTO_QUALITY_STEPS,
  FULL_PHOTO_TARGET_BYTES,
  MAX_FULL_PHOTO_BYTES,
  MAX_ORIGINAL_PHOTO_BYTES,
  MAX_THUMB_PHOTO_BYTES,
  THUMB_PHOTO_EDGE,
  THUMB_PHOTO_QUALITY_STEPS,
  THUMB_PHOTO_TARGET_BYTES,
  chooseOutputFormat,
  encodeWithinBudget,
  type OutputFormat,
  type ReviewPhoto,
} from "@/lib/review-photos";

export type { ReviewPhoto };

export interface PreparedReviewPhoto {
  /** Stable key for the form's thumbnail list. */
  key: string;
  /** Identifies the picked file (name|size|lastModified), so re-picking it is skipped. */
  fingerprint: string;
  /** Object URL of the thumbnail, for the in-form preview (revoke on remove). */
  previewUrl: string;
  full: string;
  thumb: string;
  /** What was produced (shown nowhere; useful for debugging and tests). */
  meta: { format: OutputFormat; width: number; height: number; fullBytes: number; thumbBytes: number; transparent: boolean };
}

export const photoFingerprint = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    // Applies the photo's EXIF orientation, so portrait phone shots stay upright.
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const MIME: Record<OutputFormat, string> = { webp: "image/webp", png: "image/png", jpeg: "image/jpeg" };

function toBlob(canvas: HTMLCanvasElement, format: OutputFormat, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), MIME[format], quality),
  );
}

// Browsers that can't encode WebP silently return PNG instead -- detect once.
let webpSupport: Promise<boolean> | null = null;
function canEncodeWebp(): Promise<boolean> {
  webpSupport ??= (async () => {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    try {
      return (await toBlob(c, "webp", 0.8)).type === "image/webp";
    } catch {
      return false;
    }
  })();
  return webpSupport;
}

/** True if any pixel is not fully opaque. */
function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
  return false;
}

/** Copy of `canvas` composited onto white (for the opaque JPEG last resort). */
function flattenOnWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const g = out.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(canvas, 0, 0);
  return out;
}

/** Encodes one rendition in `format`, stepping quality down toward the byte target. */
async function encodeRendition(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  qualities: readonly number[],
  targetBytes: number,
  hardCapBytes: number,
): Promise<Blob> {
  if (format === "png") {
    // Lossless -- no quality steps. Too heavy even for the hard cap: keep the
    // pixels, lose only the transparency (white background, JPEG).
    const png = await toBlob(canvas, "png");
    if (png.size <= hardCapBytes) return png;
    return encodeRendition(flattenOnWhite(canvas), "jpeg", qualities, targetBytes, hardCapBytes);
  }
  return (await encodeWithinBudget((q) => toBlob(canvas, format, q), qualities, targetBytes)).result;
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Validates a picked file and produces, in one pass each:
 *  - the full image: fits 1600x1600 (aspect ratio kept, never upscaled),
 *    compressed toward ~300 KB;
 *  - a square, centre-cropped 192px thumbnail, toward ~40 KB.
 * WebP when the browser can encode it (transparency kept); otherwise PNG for
 * transparent images and JPEG for opaque ones. Animated images keep only
 * their first frame. Re-encoding drops all metadata, including the GPS
 * location phones embed in photos.
 */
export async function prepareReviewPhoto(file: File): Promise<PreparedReviewPhoto | { error: string }> {
  if (!(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return { error: `"${file.name}" isn't a JPG, PNG or WebP image.` };
  }
  if (file.size > MAX_ORIGINAL_PHOTO_BYTES) return { error: `"${file.name}" is larger than 10 MB.` };

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    return { error: `"${file.name}" couldn't be read as an image.` };
  }
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!w || !h) return { error: `"${file.name}" couldn't be read as an image.` };

  try {
    const scale = Math.min(1, FULL_PHOTO_MAX_EDGE / Math.max(w, h));
    const full = document.createElement("canvas");
    full.width = Math.round(w * scale);
    full.height = Math.round(h * scale);
    full.getContext("2d")!.drawImage(source, 0, 0, full.width, full.height);

    // Centre-cropped square thumbnail.
    const side = Math.min(w, h);
    const thumb = document.createElement("canvas");
    thumb.width = thumb.height = THUMB_PHOTO_EDGE;
    thumb.getContext("2d")!.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, THUMB_PHOTO_EDGE, THUMB_PHOTO_EDGE);

    // JPEG can't carry transparency, so only PNG/WebP sources need the scan.
    const transparent = file.type !== "image/jpeg" && hasTransparency(full);
    const format = chooseOutputFormat({ webpSupported: await canEncodeWebp(), transparent });
    const [fullBlob, thumbBlob] = await Promise.all([
      encodeRendition(full, format, FULL_PHOTO_QUALITY_STEPS, FULL_PHOTO_TARGET_BYTES, MAX_FULL_PHOTO_BYTES),
      encodeRendition(thumb, format, THUMB_PHOTO_QUALITY_STEPS, THUMB_PHOTO_TARGET_BYTES, MAX_THUMB_PHOTO_BYTES),
    ]);
    return {
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fingerprint: photoFingerprint(file),
      previewUrl: URL.createObjectURL(thumbBlob),
      full: await toBase64(fullBlob),
      thumb: await toBase64(thumbBlob),
      meta: {
        format: (fullBlob.type.replace("image/", "") as OutputFormat) || format,
        width: full.width,
        height: full.height,
        fullBytes: fullBlob.size,
        thumbBytes: thumbBlob.size,
        transparent,
      },
    };
  } catch {
    return { error: `"${file.name}" couldn't be processed.` };
  } finally {
    if ("close" in source) source.close();
  }
}

/**
 * Approved photos for one product, grouped by review id, in upload order.
 * The server signs URLs only for approved reviews' photos (the bucket is
 * private and the photo table server-only), so pending/rejected photos
 * never come back. Failures just mean no photos are shown.
 */
export async function loadApprovedReviewPhotos(productHandle: string): Promise<Map<string, ReviewPhoto[]>> {
  try {
    const { getApprovedReviewPhotos } = await import("@/lib/review-photos.functions");
    return new Map(Object.entries(await getApprovedReviewPhotos({ data: { productHandle } })));
  } catch (error) {
    console.error("Error loading review photos:", error);
    return new Map();
  }
}
