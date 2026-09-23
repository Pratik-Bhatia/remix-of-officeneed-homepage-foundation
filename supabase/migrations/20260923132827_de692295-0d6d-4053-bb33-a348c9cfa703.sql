
-- product_enquiries: real content validation instead of blanket accept
DROP POLICY IF EXISTS "Anyone can submit a product enquiry" ON public.product_enquiries;
CREATE POLICY "Public enquiry submissions must be valid"
ON public.product_enquiries FOR INSERT TO anon, authenticated
WITH CHECK (
  status = 'new'
  AND length(btrim(name)) BETWEEN 1 AND 120
  AND length(btrim(message)) BETWEEN 1 AND 4000
  AND length(product_slug) BETWEEN 1 AND 200
  AND length(product_name) BETWEEN 1 AND 300
  AND length(category) BETWEEN 1 AND 120
  AND (company IS NULL OR length(company) <= 200)
  AND length(email) <= 254
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND (quantity IS NULL OR (quantity > 0 AND quantity <= 1000000))
);

-- corporate_quote_requests: real content validation
DROP POLICY IF EXISTS "Anyone can submit a corporate quote request" ON public.corporate_quote_requests;
CREATE POLICY "Public quote submissions must be valid"
ON public.corporate_quote_requests FOR INSERT TO anon, authenticated
WITH CHECK (
  status = 'new'
  AND length(btrim(customer_name)) BETWEEN 1 AND 120
  AND length(btrim(company_name)) BETWEEN 1 AND 200
  AND length(work_email) <= 254
  AND work_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND length(btrim(phone)) BETWEEN 6 AND 20
  AND quantity > 0 AND quantity <= 1000000
  AND length(btrim(delivery_location)) BETWEEN 1 AND 300
  AND (additional_requirements IS NULL OR length(additional_requirements) <= 4000)
  AND (printing_method IS NULL OR length(printing_method) <= 120)
  AND length(product_id) BETWEEN 1 AND 200
  AND length(product_name) BETWEEN 1 AND 300
  AND (product_variant IS NULL OR length(product_variant) <= 200)
  AND (logo_storage_path IS NULL OR logo_storage_path ~ '^logos/')
  AND (preview_image_path IS NULL OR preview_image_path ~ '^previews/')
  AND (required_delivery_date IS NULL OR required_delivery_date >= (CURRENT_DATE - 1))
);

-- product_reviews: real content validation, always starts unreviewed
DROP POLICY IF EXISTS "Anyone can submit a review" ON public.product_reviews;
CREATE POLICY "Public review submissions must be valid"
ON public.product_reviews FOR INSERT TO anon, authenticated
WITH CHECK (
  status = 'pending'
  AND is_verified_buyer = false
  AND rating BETWEEN 1 AND 5
  AND length(btrim(title)) BETWEEN 1 AND 150
  AND length(btrim(body)) BETWEEN 1 AND 4000
  AND length(btrim(author_name)) BETWEEN 1 AND 120
  AND length(author_email) <= 254
  AND author_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND length(product_handle) BETWEEN 1 AND 200
);

-- attachment metadata is only ever written by the server (service role)
DROP POLICY IF EXISTS "Anyone can record enquiry attachment metadata" ON public.product_enquiry_attachments;
REVOKE INSERT ON public.product_enquiry_attachments FROM anon, authenticated;

-- storage: uploads happen server-side only
DROP POLICY IF EXISTS "Image-only uploads to corporate quote assets" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload enquiry attachments" ON storage.objects;
