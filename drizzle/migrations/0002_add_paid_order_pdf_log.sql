-- Idempotency/status log for the internal "Paid Online" order record PDF
-- (see src/lib/shopify-order-webhook.server.ts). Keyed by the real Shopify
-- order id (UNIQUE), so a retried or duplicate orders/paid webhook
-- delivery for the same order can never generate or email the internal
-- PDF twice. `status` tracks whether that one record was actually
-- completed:
--   pending -> claimed by a webhook delivery, processing not yet finished
--   sent    -> PDF generated and emailed to the OfficeNeed team -- terminal,
--              never reprocessed again for this order
--   failed  -> PDF generation or email delivery failed after claiming the
--              row; a later webhook delivery (Shopify retries on non-2xx,
--              or occasionally redelivers) is allowed to retry from here
-- This table holds no customer-facing data beyond what Shopify's own order
-- already contains -- it is purely an internal processing log, never
-- exposed to the storefront or customer account.
CREATE TABLE public.paid_order_internal_pdf_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id text NOT NULL UNIQUE,
  shopify_order_number text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paid_order_internal_pdf_log_status_check CHECK (status IN ('pending', 'sent', 'failed'))
);
GRANT ALL ON public.paid_order_internal_pdf_log TO service_role;
ALTER TABLE public.paid_order_internal_pdf_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to paid order pdf log" ON public.paid_order_internal_pdf_log FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER update_paid_order_internal_pdf_log_updated_at BEFORE UPDATE ON public.paid_order_internal_pdf_log FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
