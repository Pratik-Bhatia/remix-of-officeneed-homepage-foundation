-- Fixes an RLS gap found during pre-deployment review of
-- 20261014140000_restore_b2b_manual_approval.sql, BEFORE that migration
-- was ever applied to production.
--
-- src/lib/admin-b2b.functions.ts reads/writes b2b_companies and
-- business_account_requests through the AUTHENTICATED admin's own
-- Supabase client (requireSupabaseAuth's context.supabase) -- the same
-- pattern src/lib/admin-quotes.functions.ts already uses for
-- corporate_quote_requests, and src/lib/admin-reviews.functions.ts for
-- product_reviews. Both of those tables have explicit admin-authenticated
-- GRANT + RLS policy pairs (see 20260825114336_...sql and
-- 20260903063241_.../20260903064126_...sql). b2b_companies and
-- business_account_requests do not -- the previous migration only
-- granted service_role access and denied anon/authenticated outright, so
-- every admin-dashboard query against these two tables would be blocked:
-- SELECTs return zero rows (not an error) and INSERT/UPDATE either affect
-- zero rows or are outright denied, making the whole B2B approval
-- dashboard non-functional. public.has_role() already has
-- `GRANT EXECUTE ... TO authenticated` from 20260903065728_...sql, so
-- only the per-table grants and policies below are needed.
--
-- Additive only: the original "No direct client access" FOR ALL
-- USING (false) policies on both tables are untouched and still deny
-- anon and any non-admin authenticated user -- Postgres RLS policies for
-- the same command are OR'd (both are PERMISSIVE, the default), so these
-- new admin-scoped policies only ADD access for actual admins, never
-- remove the existing deny-all for everyone else.
--
-- Each CREATE POLICY is preceded by DROP POLICY IF EXISTS -- CREATE
-- POLICY has no IF NOT EXISTS form in Postgres, and this project's own
-- convention (see 20260825114336_...sql) already uses this pair for
-- exactly that reason: a re-apply of this migration fails safely into a
-- no-op instead of erroring on "policy already exists".

GRANT SELECT, INSERT, UPDATE ON public.b2b_companies TO authenticated;
DROP POLICY IF EXISTS "Admins can read b2b companies" ON public.b2b_companies;
CREATE POLICY "Admins can read b2b companies" ON public.b2b_companies FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can insert b2b companies" ON public.b2b_companies;
CREATE POLICY "Admins can insert b2b companies" ON public.b2b_companies FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can update b2b companies" ON public.b2b_companies;
CREATE POLICY "Admins can update b2b companies" ON public.b2b_companies FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, UPDATE ON public.business_account_requests TO authenticated;
DROP POLICY IF EXISTS "Admins can read business account requests" ON public.business_account_requests;
CREATE POLICY "Admins can read business account requests" ON public.business_account_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can update business account requests" ON public.business_account_requests;
CREATE POLICY "Admins can update business account requests" ON public.business_account_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
