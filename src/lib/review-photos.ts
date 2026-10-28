/**
 * Customer review photos -- shared, pure logic (no I/O): limits, review
 * field validation, image-header inspection and the thumbnail strip
 * layout. Used by the browser form, the submit server function
 * (review-photos.functions.ts) and the review list.
 *
 * Storage model (see supabase/migrations/*_add_review_images.sql): files
 * live in the PRIVATE `review-images` bucket, one row per photo in the
 * server-only `product_review_images` table. The server hands out signed
 * URLs only for photos whose review is `approved` (same moderation as the
 * review text).
 */

export const REVIEW_PHOTO_BUCKET = "review-images";
export const MAX_REVIEW_PHOTOS = 5;
/** What the shopper may pick (before in-browser downscaling). */
export const MAX_ORIGINAL_PHOTO_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Long edge of the stored full-size image / edge of the square thumbnail. */
export const FULL_PHOTO_MAX_EDGE = 1600;
export const THUMB_PHOTO_EDGE = 192;
/** Server-side limits on what is actually stored (after downscaling). */
export const MAX_FULL_PHOTO_BYTES = 2.5 * 1024 * 1024;
export const MAX_THUMB_PHOTO_BYTES = 200 * 1024;
const MAX_PHOTO_DIMENSION = 8000;

/** An approved photo as the storefront displays it (short-lived signed URLs). */
export interface ReviewPhoto {
  thumbUrl: string;
  fullUrl: string;
  width: number | null;
  height: number | null;
}

export type ImageFormat = "jpeg" | "png" | "webp";
export const IMAGE_CONTENT_TYPE: Record<ImageFormat, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const IMAGE_EXTENSION: Record<ImageFormat, string> = { jpeg: "jpg", png: "png", webp: "webp" };

export interface ReviewFields {
  productHandle: string;
  rating: number;
  title: string;
  body: string;
  authorName: string;
  authorEmail: string;
}

/**
 * Mirrors the "Public review submissions must be valid" RLS INSERT policy
 * on product_reviews exactly -- photo reviews are inserted by the server
 * (service role, which bypasses RLS), so the same rules are enforced here.
 */
export function validateReviewFields(input: ReviewFields): string | null {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return "Please select a rating.";
  const len = (s: string) => (typeof s === "string" ? s.trim().length : 0);
  if (len(input.title) < 1 || len(input.title) > 150) return "Review title is required (max 150 characters).";
  if (len(input.body) < 1 || len(input.body) > 4000) return "Please write your review (max 4000 characters).";
  if (len(input.authorName) < 1 || len(input.authorName) > 120) return "Name is required.";
  if (typeof input.authorEmail !== "string" || input.authorEmail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.authorEmail)) {
    return "A valid email is required.";
  }
  if (typeof input.productHandle !== "string" || input.productHandle.length < 1 || input.productHandle.length > 200) {
    return "Missing product information.";
  }
  return null;
}

/**
 * Identifies a real JPEG/PNG/WebP from its bytes (never the client's MIME
 * type) and reads its pixel size from the header. Returns null for
 * anything else, truncated headers, animated WebP, or absurd dimensions.
 */
export function inspectImage(bytes: Uint8Array): { format: ImageFormat; width: number; height: number } | null {
  const b = bytes;
  const ok = (format: ImageFormat, width: number, height: number) =>
    width >= 1 && height >= 1 && width <= MAX_PHOTO_DIMENSION && height <= MAX_PHOTO_DIMENSION ? { format, width, height } : null;
  const ascii = (start: number, end: number) => String.fromCharCode(...b.subarray(start, end));

  // PNG: 8-byte signature, then the IHDR chunk (big-endian width/height).
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    if (ascii(12, 16) !== "IHDR") return null;
    const u32 = (o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
    return ok("png", u32(16), u32(20));
  }

  // JPEG: walk the marker segments to the first start-of-frame.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 3 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xff) { i++; continue; } // fill byte
      if (marker === 0xd9 || marker === 0xda) return null; // end/scan before any frame header
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const segLen = (b[i + 2]! << 8) | b[i + 3]!;
      if (segLen < 2) return null;
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        if (i + 8 >= b.length) return null;
        return ok("jpeg", (b[i + 7]! << 8) | b[i + 8]!, (b[i + 5]! << 8) | b[i + 6]!);
      }
      i += 2 + segLen;
    }
    return null;
  }

  // WebP: RIFF container; single-frame VP8 / VP8L / VP8X (non-animated).
  if (b.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    const chunk = ascii(12, 16);
    if (chunk === "VP8 ") {
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
      return ok("webp", (b[26]! | (b[27]! << 8)) & 0x3fff, (b[28]! | (b[29]! << 8)) & 0x3fff);
    }
    if (chunk === "VP8L") {
      if (b[20] !== 0x2f) return null;
      const width = 1 + (((b[22]! & 0x3f) << 8) | b[21]!);
      const height = 1 + (((b[24]! & 0x0f) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6));
      return ok("webp", width, height);
    }
    if (chunk === "VP8X") {
      if (b[20]! & 0x02) return null; // animation flag
      return ok("webp", 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)));
    }
    return null;
  }
  return null;
}

/** Thumbnails shown under a review: at most 3, with "+N" on the last one. */
export function photoStrip(count: number, maxVisible = 3): { visible: number; overflow: number } {
  const visible = Math.max(0, Math.min(count, maxVisible));
  return { visible, overflow: Math.max(0, count - visible) };
}

/** Generated storage paths -- never derived from the shopper's filename. */
export function reviewPhotoPaths(reviewId: string, position: number, format: ImageFormat) {
  const ext = IMAGE_EXTENSION[format];
  return { full: `${reviewId}/${position}-full.${ext}`, thumb: `${reviewId}/${position}-thumb.${ext}` };
}
