ALTER TABLE public.corporate_quote_requests
ADD COLUMN IF NOT EXISTS customization_data JSONB;