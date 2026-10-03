-- GST Number is now a required field on Company registration (previously
-- optional). Applied as a separate migration rather than editing the
-- original CREATE TABLE (20261002120000_add_business_account_requests.sql)
-- in place, since that migration may already have run.
ALTER TABLE public.business_account_requests ALTER COLUMN gst_number SET NOT NULL;
