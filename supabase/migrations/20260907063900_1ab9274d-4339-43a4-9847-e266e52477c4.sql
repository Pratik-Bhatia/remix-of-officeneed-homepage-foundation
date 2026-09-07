-- Remove broad table-level read access; public reads go through product_reviews_public only
REVOKE SELECT ON public.product_reviews FROM anon, authenticated;

-- The public view must remain readable and is evaluated with the caller's rights,
-- so give it a dedicated owner-based path: make the view security definer-free by
-- granting the view owner is not possible; instead keep view security_invoker and
-- grant the minimal column set on the base table that the view needs.
GRANT SELECT (id, product_handle, rating, title, body, author_name, is_verified_buyer, status, created_at) ON public.product_reviews TO anon, authenticated;

-- Admins still moderate (approve/reject) through the app
GRANT UPDATE (status) ON public.product_reviews TO authenticated;
GRANT DELETE ON public.product_reviews TO authenticated;