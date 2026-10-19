ALTER TABLE public.product_enquiries ADD COLUMN IF NOT EXISTS email_status text;
ALTER TABLE public.product_enquiries ADD COLUMN IF NOT EXISTS customer_email_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.product_enquiries ADD COLUMN IF NOT EXISTS internal_email_sent boolean NOT NULL DEFAULT false;