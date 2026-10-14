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
