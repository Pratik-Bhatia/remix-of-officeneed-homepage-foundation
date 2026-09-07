-- Recreate the safe public view explicitly as security invoker (no email column)
CREATE OR REPLACE VIEW public.product_reviews_public
WITH (security_invoker = true) AS
SELECT id, product_handle, rating, title, body, author_name, is_verified_buyer, status, created_at
FROM public.product_reviews
WHERE status = 'approved';

-- Allow public read of the view only
GRANT SELECT ON public.product_reviews_public TO anon, authenticated;
GRANT SELECT ON public.product_reviews_public TO service_role;

-- Re-assert: reviewer emails are never readable by public roles on the base table
REVOKE SELECT (author_email) ON public.product_reviews FROM anon, authenticated;