DROP POLICY IF EXISTS "Anyone can upload corporate quote assets" ON storage.objects;

CREATE POLICY "Image-only uploads to corporate quote assets"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'corporate-quote-assets'
  AND lower(storage.extension(name)) IN ('png', 'jpg', 'jpeg', 'webp')
  AND (storage.foldername(name))[1] IN ('logos', 'previews')
);

GRANT INSERT ON public.product_enquiry_attachments TO anon, authenticated;
GRANT ALL ON public.product_enquiry_attachments TO service_role;

CREATE POLICY "Anyone can record enquiry attachment metadata"
ON public.product_enquiry_attachments FOR INSERT
TO anon, authenticated
WITH CHECK (true);