import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  IMAGE_CONTENT_TYPE,
  MAX_FULL_PHOTO_BYTES,
  MAX_REVIEW_PHOTOS,
  MAX_THUMB_PHOTO_BYTES,
  REVIEW_PHOTO_BUCKET,
  THUMB_PHOTO_EDGE,
  inspectImage,
  reviewPhotoPaths,
  validateReviewFields,
  type ReviewFields,
  type ReviewPhoto,
} from "@/lib/review-photos";

/**
 * Review submission WITH photos. Text-only reviews keep the original
 * direct insert in ProductReviews.tsx (unchanged); this exists because a
 * photo review needs its id to link the images, which the public insert
 * path cannot return (pending rows are not publicly readable).
 *
 * Everything a client sends is re-checked here: review fields (same rules
 * as the RLS insert policy), photo count, each image's real format and
 * pixel size from its bytes, and size limits. Files get generated names
 * under `{reviewId}/`. The review is always created `pending` -- photos
 * become visible only when an admin approves it (/admin/reviews).
 */

export interface PhotoUpload {
  /** Base64 (no data-URL prefix) of the downscaled full image. */
  full: string;
  /** Base64 of the square thumbnail. */
  thumb: string;
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

type StorageClient = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => { upload: (...a: any[]) => Promise<{ error: any }>; remove: (paths: string[]) => Promise<{ error: any }> } };
};

const decode = (b64: string): Uint8Array | null => {
  try {
    const bytes = Buffer.from(b64, "base64");
    return bytes.length ? new Uint8Array(bytes) : null;
  } catch {
    return null;
  }
};

/** Plain, injectable core of submitReviewWithPhotos (tested without a real backend). */
export async function submitReviewWithPhotosCore(
  input: ReviewFields & { photos: PhotoUpload[] },
  client: StorageClient,
  newId: () => string = () => crypto.randomUUID(),
): Promise<SubmitResult> {
  const fieldError = validateReviewFields(input);
  if (fieldError) return { ok: false, error: fieldError };
  if (!Array.isArray(input.photos) || input.photos.length < 1) return { ok: false, error: "No photos were attached." };
  if (input.photos.length > MAX_REVIEW_PHOTOS) return { ok: false, error: `You can add up to ${MAX_REVIEW_PHOTOS} photos.` };

  // Validate every photo before storing anything.
  const prepared = [];
  for (const [i, photo] of input.photos.entries()) {
    const full = decode(photo.full);
    const thumb = decode(photo.thumb);
    if (!full || !thumb) return { ok: false, error: `Photo ${i + 1} could not be read.` };
    if (full.length > MAX_FULL_PHOTO_BYTES || thumb.length > MAX_THUMB_PHOTO_BYTES) {
      return { ok: false, error: `Photo ${i + 1} is too large.` };
    }
    const fullInfo = inspectImage(full);
    const thumbInfo = inspectImage(thumb);
    if (!fullInfo || !thumbInfo) return { ok: false, error: `Photo ${i + 1} isn't a valid JPG, PNG or WebP image.` };
    if (thumbInfo.width > THUMB_PHOTO_EDGE * 2 || thumbInfo.height > THUMB_PHOTO_EDGE * 2) {
      return { ok: false, error: `Photo ${i + 1} could not be processed.` };
    }
    prepared.push({ full, thumb, fullInfo, thumbInfo });
  }

  const reviewId = newId();
  const bucket = client.storage.from(REVIEW_PHOTO_BUCKET);
  const stored: string[] = [];
  const rollback = async (removeReview: boolean) => {
    if (stored.length) await bucket.remove(stored).catch(() => {});
    if (removeReview) await client.from("product_reviews").delete().eq("id", reviewId).then(() => {}, () => {});
  };

  // 1. Files first (nothing references them until the rows below exist).
  const rows = [];
  for (const [position, p] of prepared.entries()) {
    const paths = reviewPhotoPaths(reviewId, position, p.fullInfo.format);
    const thumbPath = reviewPhotoPaths(reviewId, position, p.thumbInfo.format).thumb;
    for (const [path, bytes, format] of [
      [paths.full, p.full, p.fullInfo.format],
      [thumbPath, p.thumb, p.thumbInfo.format],
    ] as const) {
      const { error } = await bucket.upload(path, bytes, { contentType: IMAGE_CONTENT_TYPE[format], upsert: false });
      if (error) {
        console.error("[review-photos] upload failed", error.message ?? error);
        await rollback(false);
        return { ok: false, error: "Your photos couldn't be uploaded. Please try again." };
      }
      stored.push(path);
    }
    rows.push({
      review_id: reviewId,
      product_handle: input.productHandle,
      position,
      full_path: paths.full,
      thumb_path: thumbPath,
      width: p.fullInfo.width,
      height: p.fullInfo.height,
    });
  }

  // 2. The review itself -- always pending, never a verified buyer.
  const { error: reviewError } = await client.from("product_reviews").insert({
    id: reviewId,
    product_handle: input.productHandle,
    rating: input.rating,
    title: input.title.trim(),
    body: input.body.trim(),
    author_name: input.authorName.trim(),
    author_email: input.authorEmail.trim(),
    is_verified_buyer: false,
    status: "pending",
  });
  if (reviewError) {
    console.error("[review-photos] review insert failed", reviewError.message ?? reviewError);
    await rollback(false);
    return { ok: false, error: "Failed to submit review. Please try again." };
  }

  // 3. Link the photos to the review.
  const { error: rowsError } = await client.from("product_review_images").insert(rows);
  if (rowsError) {
    console.error("[review-photos] image rows insert failed", rowsError.message ?? rowsError);
    await rollback(true);
    return { ok: false, error: "Failed to submit review. Please try again." };
  }
  return { ok: true };
}

/**
 * Approved photos for one product, grouped by review id in upload order,
 * as short-lived signed URLs. This is the ONLY way photos reach the
 * storefront: the bucket is private and the photo table is server-only, so
 * the approved-status check here is what keeps pending/rejected photos
 * unpublished. Any failure just means no photos are shown.
 */
export async function getApprovedReviewPhotosCore(
  productHandle: string,
  client: { from: (table: string) => any; storage: { from: (bucket: string) => any } },
): Promise<Record<string, ReviewPhoto[]>> {
  const result: Record<string, ReviewPhoto[]> = {};
  const { data: approved, error: reviewsError } = await client
    .from("product_reviews")
    .select("id")
    .eq("product_handle", productHandle)
    .eq("status", "approved");
  if (reviewsError || !approved?.length) return result;

  const { data: rows, error: rowsError } = await client
    .from("product_review_images")
    .select("review_id, position, full_path, thumb_path, width, height")
    .in("review_id", approved.map((r: { id: string }) => r.id))
    .order("position", { ascending: true });
  if (rowsError || !rows?.length) return result;

  const paths: string[] = rows.flatMap((r: { thumb_path: string; full_path: string }) => [r.thumb_path, r.full_path]);
  const { data: signed, error: signError } = await client.storage.from(REVIEW_PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
  if (signError || !signed) return result;
  const urlFor = new Map<string, string>(
    signed.filter((s: { signedUrl?: string; error?: unknown }) => s.signedUrl && !s.error).map((s: { path: string; signedUrl: string }) => [s.path, s.signedUrl]),
  );

  for (const r of rows as Array<{ review_id: string; full_path: string; thumb_path: string; width: number | null; height: number | null }>) {
    const thumbUrl = urlFor.get(r.thumb_path);
    const fullUrl = urlFor.get(r.full_path);
    if (!thumbUrl || !fullUrl) continue;
    (result[r.review_id] ??= []).push({ thumbUrl, fullUrl, width: r.width, height: r.height });
  }
  return result;
}

export const getApprovedReviewPhotos = createServerFn({ method: "GET" })
  .validator((input: { productHandle: string }) => {
    if (typeof input?.productHandle !== "string" || !input.productHandle || input.productHandle.length > 200) {
      throw new Error("Invalid product.");
    }
    return input;
  })
  .handler(async ({ data }): Promise<Record<string, ReviewPhoto[]>> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return await getApprovedReviewPhotosCore(data.productHandle, supabaseAdmin as unknown as Parameters<typeof getApprovedReviewPhotosCore>[1]);
    } catch (err) {
      console.error("[review-photos] could not load approved photos", err);
      return {};
    }
  });

const schema = z.object({
  productHandle: z.string().min(1).max(200),
  rating: z.number().int(),
  title: z.string().max(400),
  body: z.string().max(8000),
  authorName: z.string().max(300),
  authorEmail: z.string().max(300),
  photos: z
    .array(z.object({ full: z.string().min(1).max(4_000_000), thumb: z.string().min(1).max(300_000) }))
    .min(1)
    .max(MAX_REVIEW_PHOTOS),
});

export const submitReviewWithPhotos = createServerFn({ method: "POST" })
  .validator((data) => schema.parse(data))
  .handler(async ({ data }): Promise<SubmitResult> => {
    let client: StorageClient;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      client = supabaseAdmin as unknown as StorageClient;
    } catch (err) {
      console.error("[review-photos] storage client unavailable", err);
      return { ok: false, error: "Photo uploads aren't available right now. Please try again later." };
    }
    return submitReviewWithPhotosCore(data, client);
  });
