-- Restore approved-review row access (needed by the security_invoker public view),
-- but restrict anon/authenticated to non-sensitive columns only.
CREATE POLICY "Anyone can view approved reviews"
ON public.product_reviews
FOR SELECT
TO anon, authenticated
USING (status = 'approved');

REVOKE SELECT ON public.product_reviews FROM anon, authenticated;

GRANT SELECT (id, product_handle, rating, title, body, author_name, is_verified_buyer, status, created_at)
ON public.product_reviews TO anon, authenticated;

-- author_email remains readable only via service_role (admin moderation path).
