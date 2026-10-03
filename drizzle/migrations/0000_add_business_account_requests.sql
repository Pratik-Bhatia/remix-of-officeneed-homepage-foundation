CREATE TABLE IF NOT EXISTS public.business_account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id text NOT NULL UNIQUE,
  company_name text NOT NULL,
  gst_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.business_account_requests TO service_role;
ALTER TABLE public.business_account_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to business account requests" ON public.business_account_requests FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER update_business_account_requests_updated_at BEFORE UPDATE ON public.business_account_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();