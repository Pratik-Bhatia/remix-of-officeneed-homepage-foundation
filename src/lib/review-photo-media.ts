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
import { supabase } from "@/integrations/supabase/client";
import type { ReviewPhotoClient } from "@/lib/review-photo-schema";
import {
  ACCEPTED_PHOTO_TYPES,
  FULL_PHOTO_MAX_EDGE,
  MAX_ORIGINAL_PHOTO_BYTES,
  REVIEW_PHOTO_BUCKET,
  THUMB_PHOTO_EDGE,
} from "@/lib/review-photos";

export interface PreparedReviewPhoto {
  /** Stable key for the form's thumbnail list. */
  key: string;
  /** Object URL of the thumbnail, for the in-form preview (revoke on remove). */
  previewUrl: string;
  full: string;
  thumb: string;
}

export interface ReviewPhoto {
  thumbUrl: string;
  fullUrl: string;
  width: number | null;
  height: number | null;
}

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

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // WebP where the browser can encode it (smaller); JPEG otherwise.
    canvas.toBlob((webp) => {
      if (webp && webp.type === "image/webp") return resolve(webp);
      canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error("encode failed"))), "image/jpeg", quality);
    }, "image/webp", quality);
  });
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Validates a picked file and produces the downscaled full image (long edge
 * <= 1600px) and a square thumbnail. Re-encoding drops all metadata,
 * including the GPS location phones embed in photos.
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

    const [fullBlob, thumbBlob] = await Promise.all([encode(full, 0.85), encode(thumb, 0.8)]);
    return {
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      previewUrl: URL.createObjectURL(thumbBlob),
      full: await toBase64(fullBlob),
      thumb: await toBase64(thumbBlob),
    };
  } catch {
    return { error: `"${file.name}" couldn't be processed.` };
  } finally {
    if ("close" in source) source.close();
  }
}

/**
 * Approved photos for one product, grouped by review id, in upload order.
 * RLS returns rows (and storage signs files) only for approved reviews, so
 * pending/rejected photos never come back. One query plus one batched
 * signed-URL request; failures just mean no photos are shown.
 */
export async function loadApprovedReviewPhotos(productHandle: string): Promise<Map<string, ReviewPhoto[]>> {
  const byReview = new Map<string, ReviewPhoto[]>();
  const { data: rows, error } = await (supabase as unknown as ReviewPhotoClient)
    .from("product_review_images")
    .select("review_id, position, full_path, thumb_path, width, height")
    .eq("product_handle", productHandle)
    .order("position", { ascending: true });
  if (error || !rows?.length) {
    if (error) console.error("Error fetching review photos:", error);
    return byReview;
  }

  const paths = rows.flatMap((r) => [r.thumb_path, r.full_path]);
  const { data: signed, error: signError } = await supabase.storage.from(REVIEW_PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
  if (signError || !signed) {
    console.error("Error signing review photo URLs:", signError);
    return byReview;
  }
  const urlFor = new Map(signed.filter((s) => s.signedUrl && !s.error).map((s) => [s.path, s.signedUrl]));

  for (const r of rows) {
    const thumbUrl = urlFor.get(r.thumb_path);
    const fullUrl = urlFor.get(r.full_path);
    if (!thumbUrl || !fullUrl) continue;
    const list = byReview.get(r.review_id) ?? [];
    list.push({ thumbUrl, fullUrl, width: r.width, height: r.height });
    byReview.set(r.review_id, list);
  }
  return byReview;
}
