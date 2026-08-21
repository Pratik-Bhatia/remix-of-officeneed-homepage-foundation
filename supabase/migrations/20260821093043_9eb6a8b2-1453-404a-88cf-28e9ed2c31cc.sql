CREATE POLICY "Public can read enquiry attachments"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'enquiry-attachments'
  AND (storage.foldername(name))[1] = 'chat-uploads'
);