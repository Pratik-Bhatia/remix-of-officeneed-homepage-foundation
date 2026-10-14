-- Restores manual B2B company approval (removed for one day in this
-- repo's history, see commits a8f79cf -> 6039f3d) and adds owner-
-- controlled payment terms per approved company.
--
-- Two tables now carry the real approval/terms state:
--
-- b2b_companies: one row per APPROVED GSTIN -- the durable "this company
-- exists in Shopify and has these payment terms" record. UNIQUE on
-- gst_number so two approvals for the same GST can never create two
-- Shopify Companies (src/lib/admin-b2b.functions.ts always looks this up
-- by GST before provisioning). payment_terms_template_id/name are only
-- ever set for 'pay_later' -- they mirror the template actually applied
-- to the Shopify Company Location's buyerExperienceConfiguration via
-- companyLocationUpdate (confirmed live against this store's Admin API
-- 2026-10 schema before writing this migration).
--
-- business_account_requests: becomes the real per-customer application /
-- additional-contact-review queue (previously just inert intake data --
-- see 20261002120000_add_business_account_requests.sql's own comment).
-- A row starts 'pending' the moment a customer registers on the Company
-- tab (src/lib/business-registration.functions.ts) or a new contact
-- registers against an already-approved GSTIN -- EITHER case requires an
-- explicit admin decision now; nothing here grants Shopify access by
-- itself. b2b_company_id links a request to the b2b_companies row for
-- that GST once one exists (set at intake time if the GST is already
-- known, or on approval if it's brand new), giving the admin dashboard
-- context without ever being the thing that grants access.
CREATE TABLE public.b2b_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gst_number text NOT NULL UNIQUE,
  company_name text NOT NULL,
  shopify_company_id text NOT NULL,
  shopify_company_location_id text NOT NULL,
  payment_terms text NOT NULL DEFAULT 'pay_now' CHECK (payment_terms IN ('pay_now','pay_later')),
  payment_terms_template_id text,
  payment_terms_template_name text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.b2b_companies TO service_role;
ALTER TABLE public.b2b_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to b2b companies" ON public.b2b_companies FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER update_b2b_companies_updated_at BEFORE UPDATE ON public.b2b_companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.business_account_requests
  ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  ADD COLUMN b2b_company_id uuid REFERENCES public.b2b_companies(id),
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN rejection_reason text,
  ADD COLUMN contact_name text,
  ADD COLUMN phone text,
  -- Optional -- only the "upgrade" (already-signed-in customer adding a
  -- business) form collects these; the compact fresh-registration form
  -- doesn't. Stored here (not applied to Shopify until approval) so it
  -- isn't silently dropped now that address assignment only happens from
  -- provisionShopifyCompanyForApproval (src/lib/b2b-company-setup.functions.ts),
  -- never at registration time.
  ADD COLUMN address_line1 text,
  ADD COLUMN address_line2 text,
  ADD COLUMN city text,
  ADD COLUMN state text,
  ADD COLUMN pin text,
  ADD COLUMN country text;

CREATE INDEX business_account_requests_status_idx ON public.business_account_requests (status);
CREATE INDEX business_account_requests_gst_number_idx ON public.business_account_requests (gst_number);
