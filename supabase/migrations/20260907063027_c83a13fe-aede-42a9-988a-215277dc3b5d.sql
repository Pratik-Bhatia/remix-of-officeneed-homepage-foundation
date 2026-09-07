CREATE TABLE public.customer_saves (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_customer_id text NOT NULL,
  product_handle text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (shopify_customer_id, product_handle)
);

GRANT ALL ON public.customer_saves TO service_role;

ALTER TABLE public.customer_saves ENABLE ROW LEVEL SECURITY;

CREATE INDEX customer_saves_customer_idx ON public.customer_saves (shopify_customer_id, created_at DESC);