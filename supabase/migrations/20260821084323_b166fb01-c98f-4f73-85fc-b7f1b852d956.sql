CREATE POLICY "Public can upload enquiry attachments"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'enquiry-attachments');

CREATE POLICY "Public can read enquiry attachments"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'enquiry-attachments');