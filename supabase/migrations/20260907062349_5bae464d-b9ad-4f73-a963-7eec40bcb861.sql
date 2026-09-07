-- 1) Public view exposing only non-sensitive review fields for approved reviews
create or replace view public.product_reviews_public
with (security_invoker = false) as
  select id, product_handle, rating, title, body, author_name, is_verified_buyer, status, created_at
  from public.product_reviews
  where status = 'approved';

grant select on public.product_reviews_public to anon, authenticated;

-- 2) Remove the broad public SELECT on the base table (emails stay admin-only)
drop policy if exists "Anyone can view approved reviews" on public.product_reviews;

-- 3) Rewrite admin policies without has_role so the definer function need not be executable
drop policy if exists "Admins can read all reviews" on public.product_reviews;
create policy "Admins can read all reviews"
on public.product_reviews for select to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::public.app_role));

drop policy if exists "Admins can update reviews" on public.product_reviews;
create policy "Admins can update reviews"
on public.product_reviews for update to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::public.app_role))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::public.app_role));

drop policy if exists "Admins can delete reviews" on public.product_reviews;
create policy "Admins can delete reviews"
on public.product_reviews for delete to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::public.app_role));

-- 4) Lock down the SECURITY DEFINER role-check function
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;