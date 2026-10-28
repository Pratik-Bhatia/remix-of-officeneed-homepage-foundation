-- Customer photos on product reviews: metadata table only.
--
-- PREREQUISITE (not SQL -- Lovable Cloud does not allow creating storage
-- buckets from migrations): create a PRIVATE storage bucket named
-- `review-images` with the Lovable Cloud storage tool. Do not make it public.
-- Bucket-level MIME/size limits are not required: the bucket is written only
-- by the server (service role), which already validates every file's real
-- format, pixel size and byte size (src/lib/review-photos.functions.ts).
--
-- Files live in that private bucket; one row here per photo links it to its
-- review and product. No image bytes are stored in any table row.
--
-- Access: this table is server-only. The public never reads it directly and
-- there are NO policies for anon/authenticated, so with RLS enabled they can
-- neither read nor write it. The storefront asks the server for photos; the
-- server (getApprovedReviewPhotos) returns short-lived signed URLs ONLY for
-- photos whose review is `approved`. Pending or rejected photos are never
-- signed, and the bucket is private, so they are unreachable. Only the
-- server inserts or deletes photos (submit, and admin reject).

CREATE TABLE IF NOT EXISTS public.product_review_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.product_reviews(id) ON DELETE CASCADE,
  product_handle text NOT NULL CHECK (length(product_handle) BETWEEN 1 AND 200),
  -- 0-4: at most five photos per review, in the order the shopper added them.
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 4),
  full_path text NOT NULL,
  thumb_path text NOT NULL,
  width integer CHECK (width BETWEEN 1 AND 8000),
  height integer CHECK (height BETWEEN 1 AND 8000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, position)
);
CREATE INDEX IF NOT EXISTS product_review_images_review_id_idx ON public.product_review_images (review_id);
CREATE INDEX IF NOT EXISTS product_review_images_product_handle_idx ON public.product_review_images (product_handle);

ALTER TABLE public.product_review_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_review_images FROM anon, authenticated;
GRANT ALL ON public.product_review_images TO service_role;

-- Rollback (not executed -- reference only):
--   DROP TABLE IF EXISTS public.product_review_images;
--   -- then empty and delete the 'review-images' bucket in Lovable Cloud storage.
