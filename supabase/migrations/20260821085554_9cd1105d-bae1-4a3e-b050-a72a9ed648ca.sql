DROP POLICY IF EXISTS "Public can read enquiry attachments" ON storage.objects;
REVOKE SELECT ON public.product_enquiries FROM anon, authenticated;
GRANT INSERT ON public.product_enquiries TO anon, authenticated;
GRANT ALL ON public.product_enquiries TO service_role;