-- Make the public view enforce the querying user's permissions (fixes security-definer view lint)
alter view public.product_reviews_public set (security_invoker = true);

-- Restore row-level access for approved reviews on the base table (needed by the invoker view)
create policy "Anyone can view approved reviews"
on public.product_reviews for select to anon, authenticated
using (status = 'approved');

-- Hide reviewer emails from non-privileged callers at the column level;
-- admins read them via the service role in server functions
revoke select (author_email) on public.product_reviews from anon, authenticated;