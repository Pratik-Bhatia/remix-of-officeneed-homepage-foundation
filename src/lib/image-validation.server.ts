// Server-side validation for a logo upload, before it's ever sent to
// remove.bg. Never trusts the client: the caller passes raw decoded bytes
// (not a MIME type, not a filename extension, not client-reported
// dimensions), and every check here re-derives the truth from those bytes
// directly.
//
// image-size (new dependency, added for this): reads just enough of a
// PNG/JPEG/WebP/etc. header to report width/height without decoding
// pixels -- fast even on a 5MB file, and it's the only thing in this
// project that can read JPEG or WebP dimensions at all. fast-png (already
// a dependency, used elsewhere in this file's caller for the actual PNG
// pixel recolor step) only understands PNG, and has no JPEG/WebP support;
// nothing else in package.json covers this. image-size is pure JS (no
// native binary/build step, unlike sharp), small, and widely maintained --
// the right tool for "read dimensions from a header", not a general
// image-processing library pulled in for a single field.
import { imageSize } from "image-size";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_DIMENSION_PX = 4096;

export type SupportedImageFormat = "png" | "jpeg" | "webp";

export interface ValidatedImage {
  bytes: Uint8Array;
  format: SupportedImageFormat;
  width: number;
  height: number;
}

export type ImageValidationResult =
  | { valid: true; image: ValidatedImage }
  | { valid: false; error: string };

/** Magic-byte sniff only -- the authoritative format check is the
 * image-size decode below, which must independently agree with this.
 * Having both catches a file that's byte-sniffable as one format but
 * whose actual container structure doesn't parse as that format (a
 * truncated/corrupted file, or bytes crafted to pass a naive signature
 * check). */
function sniffFormat(bytes: Uint8Array): SupportedImageFormat | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export function validateUploadedImage(bytes: Uint8Array): ImageValidationResult {
  if (bytes.length === 0) {
    return { valid: false, error: "The uploaded file is empty." };
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return { valid: false, error: "Image is too large. Please upload a logo under 5MB." };
  }

  const sniffed = sniffFormat(bytes);
  if (!sniffed) {
    return { valid: false, error: "Invalid image format. Only PNG, JPEG, and WebP are supported." };
  }

  let dims;
  try {
    dims = imageSize(bytes);
  } catch {
    return { valid: false, error: "Could not read this image. The file may be corrupted or is not a valid image." };
  }

  if (!dims?.width || !dims?.height) {
    return { valid: false, error: "Could not read this image. The file may be corrupted or is not a valid image." };
  }

  const decodedMatchesSniff =
    (sniffed === "png" && dims.type === "png") ||
    (sniffed === "jpeg" && (dims.type === "jpg" || dims.type === "jpeg")) ||
    (sniffed === "webp" && dims.type === "webp");
  if (!decodedMatchesSniff) {
    return { valid: false, error: "Invalid image format. Only PNG, JPEG, and WebP are supported." };
  }

  if (dims.width > MAX_DIMENSION_PX || dims.height > MAX_DIMENSION_PX) {
    return {
      valid: false,
      error: `Image dimensions are too large (${dims.width}x${dims.height}px). Please upload a logo no larger than ${MAX_DIMENSION_PX}x${MAX_DIMENSION_PX} pixels.`,
    };
  }

  return { valid: true, image: { bytes, format: sniffed, width: dims.width, height: dims.height } };
}
