CREATE TABLE public.customer_business_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id text NOT NULL UNIQUE,
  company_name text,
  location_name text,
  contact_name text,
  phone text,
  address1 text,
  address2 text,
  city text,
  state text,
  pin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.customer_business_details TO service_role;
ALTER TABLE public.customer_business_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to customer business details" ON public.customer_business_details
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER update_customer_business_details_updated_at BEFORE UPDATE ON public.customer_business_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();