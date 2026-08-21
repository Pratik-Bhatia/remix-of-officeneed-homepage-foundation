DROP POLICY IF EXISTS "Public can upload enquiry attachments" ON storage.objects;
CREATE POLICY "Public can upload enquiry attachments"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'enquiry-attachments'
  AND (storage.foldername(name))[1] = 'chat-uploads'
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','gif','pdf','doc','docx','xls','xlsx','csv','txt')
);