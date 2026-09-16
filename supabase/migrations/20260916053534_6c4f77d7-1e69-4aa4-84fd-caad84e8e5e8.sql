-- Use column-level privileges instead of a security definer view:
-- the email column is simply not readable by public roles.

-- 1. View goes back to security invoker (no linter warning)
CREATE OR REPLACE VIEW public.product_reviews_public
WITH (security_invoker = true) AS
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

-- 2. Replace table-level SELECT with column-level grants that exclude author_email
REVOKE SELECT ON public.product_reviews FROM anon, authenticated;
GRANT SELECT (id, product_handle, rating, title, body, author_name, is_verified_buyer, status, created_at)
  ON public.product_reviews TO anon, authenticated;
GRANT SELECT ON public.product_reviews_public TO anon, authenticated;

-- 3. Row filter: public roles may only see approved reviews
CREATE POLICY "Anyone can view approved reviews"
ON public.product_reviews
FOR SELECT
TO anon, authenticated
USING (status = 'approved'::text);