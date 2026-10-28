-- Customer photos on product reviews.
--
-- Files live in a PRIVATE storage bucket; one row per photo links it to its
-- review and product. Nothing here stores image bytes in a table row.
--
-- Moderation: a photo is publicly readable (row AND file) only while its
-- review is `approved` -- the same rule the review text already follows via
-- product_reviews_public. Pending or rejected photos are never reachable,
-- not even by URL, because the bucket is private and the storefront gets
-- short-lived signed URLs, which storage only issues when the SELECT
-- policy below allows the object.
--
-- Writes: only the server (service role, src/lib/review-photos.functions.ts)
-- inserts or deletes photos/files. There are NO insert/update/delete grants
-- or policies for anon/authenticated, so no visitor can add, change or
-- remove anyone's review images.

-- 1. Private bucket, server-enforced type and size limits.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('review-images', 'review-images', false, 2621440, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 2. Photo metadata.
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
GRANT SELECT ON public.product_review_images TO anon, authenticated;
GRANT ALL ON public.product_review_images TO service_role;

-- Public may see a photo row only while its review is approved. The
-- subquery runs as the caller, so it is itself limited by the existing
-- "Anyone can view approved reviews" policy on product_reviews.
CREATE POLICY "Anyone can view photos of approved reviews"
ON public.product_review_images
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.product_reviews r
    WHERE r.id = product_review_images.review_id AND r.status = 'approved'
  )
);

-- 3. Files: readable (i.e. signable) only when they belong to a photo row
-- the caller can see -- which, per the policy above, means approved.
CREATE POLICY "Anyone can read photos of approved reviews"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'review-images'
  AND EXISTS (
    SELECT 1 FROM public.product_review_images i
    WHERE i.full_path = objects.name OR i.thumb_path = objects.name
  )
);

-- Rollback (not executed -- reference only):
--   DROP POLICY IF EXISTS "Anyone can read photos of approved reviews" ON storage.objects;
--   DROP TABLE IF EXISTS public.product_review_images;
--   -- then empty and delete the 'review-images' bucket from Storage.
