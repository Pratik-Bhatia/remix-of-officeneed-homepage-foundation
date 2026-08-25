CREATE POLICY "Public can read corporate quote assets"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'corporate-quote-assets');

CREATE POLICY "Anyone can upload corporate quote assets"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'corporate-quote-assets');