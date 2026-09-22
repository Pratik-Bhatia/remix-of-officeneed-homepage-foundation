-- Public reads must go through the safe view only; base table keeps admin-only SELECT.
DROP POLICY IF EXISTS "Anyone can view approved reviews" ON public.product_reviews;

REVOKE SELECT ON public.product_reviews FROM anon;

-- Ensure the public view (security_invoker, excludes author_email) is readable by everyone.
GRANT SELECT ON public.product_reviews_public TO anon;
GRANT SELECT ON public.product_reviews_public TO authenticated;

-- Public review submissions still work.
GRANT INSERT ON public.product_reviews TO anon;
