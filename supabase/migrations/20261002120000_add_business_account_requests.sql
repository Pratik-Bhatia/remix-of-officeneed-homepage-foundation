-- Captures the company name and GST number a shopper supplies when
-- self-registering via the "Company" tab's business registration form.
-- The Shopify customer record itself is created through the existing
-- classic customerCreate mechanism (unchanged) -- this table only holds
-- the two fields Shopify's Storefront API has no field for (company name,
-- GST number aren't native Customer/CustomerCreateInput fields, and
-- writing them as Shopify customer metafields would require Admin API
-- write_customers scope, which isn't granted). Keyed by the real Shopify
-- customer GID, mirroring the existing public.customer_carts pattern --
-- this is supplementary registration-intake data tied to a real Shopify
-- customer, not a parallel/duplicate customer database.
--
-- Registering here NEVER grants B2B pricing by itself: that still comes
-- exclusively from Shopify's real Customer -> Company Contact -> Role
-- Assignment -> Company Location relationship (see src/lib/b2b.functions.ts).
-- This table exists so the merchant can see who asked for a business
-- account and manually set up the real Company/CompanyContact/Role
-- Assignment in Shopify Admin for them.
CREATE TABLE public.business_account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id text NOT NULL UNIQUE,
  company_name text NOT NULL,
  gst_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.business_account_requests TO service_role;
ALTER TABLE public.business_account_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to business account requests" ON public.business_account_requests FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER update_business_account_requests_updated_at BEFORE UPDATE ON public.business_account_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
