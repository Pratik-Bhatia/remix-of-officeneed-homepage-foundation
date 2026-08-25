CREATE TABLE public.corporate_quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  company_name text NOT NULL,
  work_email text NOT NULL,
  phone text NOT NULL,
  quantity integer NOT NULL,
  required_delivery_date date,
  delivery_location text NOT NULL,
  additional_requirements text,
  printing_method text,
  product_id text NOT NULL,
  product_name text NOT NULL,
  product_variant text,
  logo_storage_path text,
  logo_filename text,
  logo_position_x numeric,
  logo_position_y numeric,
  logo_scale numeric,
  logo_rotation numeric,
  logo_flip_horizontal boolean NOT NULL DEFAULT false,
  logo_flip_vertical boolean NOT NULL DEFAULT false,
  preview_image_path text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.corporate_quote_requests TO anon, authenticated;
GRANT ALL ON public.corporate_quote_requests TO service_role;

ALTER TABLE public.corporate_quote_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a corporate quote request"
ON public.corporate_quote_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_corporate_quote_requests_updated_at
BEFORE UPDATE ON public.corporate_quote_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();