-- Recreate the public reviews view as security definer (bypasses base-table RLS,
-- exposes only non-sensitive columns of approved reviews)
CREATE OR REPLACE VIEW public.product_reviews_public
WITH (security_invoker = false) AS
SELECT id,
       product_handle,
       rating,
       title,
       body,
       author_name,
       is_verified_buyer,
       status,
       created_at
FROM public.product_reviews
WHERE status = 'approved'::text;

GRANT SELECT ON public.product_reviews_public TO anon, authenticated;

-- Remove direct public read access to the base table (contains author_email).
-- Admins keep full access via their existing policies.
DROP POLICY IF EXISTS "Anyone can view approved reviews" ON public.product_reviews;