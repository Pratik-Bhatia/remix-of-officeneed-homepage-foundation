ALTER TABLE corporate_quote_requests
ADD COLUMN IF NOT EXISTS product_variant_id TEXT;
