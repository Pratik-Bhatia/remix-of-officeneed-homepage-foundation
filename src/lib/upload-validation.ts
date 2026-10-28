// Shared server-side checks for customer-supplied images and email text.

/** Largest accepted logo or preview image (decoded bytes). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const MIME_BY_FORMAT = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;
export type SniffedImage = { format: keyof typeof MIME_BY_FORMAT; mimeType: (typeof MIME_BY_FORMAT)[keyof typeof MIME_BY_FORMAT] };

/** Identify PNG/JPEG/WebP from magic bytes; never trust a client-supplied MIME type. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { format: "png", mimeType: MIME_BY_FORMAT.png };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { format: "jpeg", mimeType: MIME_BY_FORMAT.jpeg };
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.subarray(a, b));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { format: "webp", mimeType: MIME_BY_FORMAT.webp };
  return null;
}

/** Rough decoded size of a base64 string, so oversized input is refused before decoding. */
export function base64DecodedSize(b64: string): number {
  const clean = b64.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/** Escape text for safe interpolation into HTML email bodies. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
