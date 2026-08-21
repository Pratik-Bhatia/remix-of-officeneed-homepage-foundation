CREATE TABLE public.product_enquiry_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id uuid NOT NULL REFERENCES public.product_enquiries(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size bigint,
  upload_status text NOT NULL DEFAULT 'stored',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enquiry_attachments_enquiry_id ON public.product_enquiry_attachments(enquiry_id);

GRANT ALL ON public.product_enquiry_attachments TO service_role;

ALTER TABLE public.product_enquiry_attachments ENABLE ROW LEVEL SECURITY;