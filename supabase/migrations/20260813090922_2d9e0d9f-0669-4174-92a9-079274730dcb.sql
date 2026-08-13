CREATE TABLE IF NOT EXISTS public.product_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  product_name text NOT NULL,
  category text NOT NULL,
  quantity integer,
  name text NOT NULL,
  company text,
  email text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.product_enquiries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_enquiries TO authenticated;
GRANT ALL ON public.product_enquiries TO service_role;

ALTER TABLE public.product_enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a product enquiry"
  ON public.product_enquiries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);