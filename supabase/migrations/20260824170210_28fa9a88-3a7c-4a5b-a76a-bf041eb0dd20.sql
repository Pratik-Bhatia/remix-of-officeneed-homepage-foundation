-- Create table for corporate quote requests
CREATE TABLE corporate_quote_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  customer_name text NOT NULL,
  company_name text NOT NULL,
  work_email text NOT NULL,
  phone text NOT NULL,
  quantity integer NOT NULL,
  required_delivery_date text,
  delivery_location text NOT NULL,
  additional_requirements text,
  product_id text NOT NULL,
  product_name text NOT NULL,
  product_variant text,
  logo_storage_path text,
  logo_filename text,
  logo_position_x numeric,
  logo_position_y numeric,
  logo_scale numeric,
  logo_rotation numeric,
  customization_data jsonb,
  preview_image_path text,
  status text DEFAULT 'new' NOT NULL
);

-- Enable RLS
ALTER TABLE corporate_quote_requests ENABLE ROW LEVEL SECURITY;

-- Only authenticated users (admins) can view/edit
CREATE POLICY "Admins can manage quote requests" 
  ON corporate_quote_requests 
  FOR ALL 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

-- Anyone (including anon) can insert new quote requests via the server function
-- Wait, actually the server function uses service_role key to bypass RLS, so we don't need a public insert policy.
-- But it's good practice to restrict it anyway.

-- Create storage bucket for corporate quote assets if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('corporate-quote-assets', 'corporate-quote-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Policies for the bucket
-- Allow service_role to do anything
CREATE POLICY "Service role can manage quote assets" 
  ON storage.objects 
  FOR ALL 
  TO service_role 
  USING (bucket_id = 'corporate-quote-assets');

-- Allow authenticated users to view quote assets
CREATE POLICY "Admins can view quote assets" 
  ON storage.objects 
  FOR SELECT 
  TO authenticated 
  USING (bucket_id = 'corporate-quote-assets');
