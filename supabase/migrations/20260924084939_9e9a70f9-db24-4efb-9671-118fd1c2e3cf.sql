CREATE TABLE public.customer_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id text NOT NULL UNIQUE,
  cart_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.customer_carts TO service_role;
ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to customer carts" ON public.customer_carts FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER update_customer_carts_updated_at BEFORE UPDATE ON public.customer_carts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();