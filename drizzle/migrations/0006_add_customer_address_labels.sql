-- Per-address labels ("Office" / "Warehouse" / "Branch Office" / "Other")
-- for a customer's own Shopify Address Book entries. Shopify's classic
-- customer Address Book (MailingAddressInput, src/lib/customer.ts) has no
-- label/nickname field at all -- confirmed via this store's live Storefront
-- API schema -- so this table exists purely to attach a small, fixed-set
-- label to an address Shopify itself still fully owns. Shopify remains the
-- only store for the address DATA (name/lines/city/state/zip/etc.); this
-- table only ever holds (customer, address id) -> label.
--
-- Keyed by the real Shopify customer GID + the real Shopify address GID,
-- mirroring the existing public.customer_business_details pattern -- never
-- a parallel/duplicate address record. A row here with no matching live
-- Shopify address is harmless orphan metadata (cleaned up best-effort on
-- address delete, see src/lib/address-labels.functions.ts), never treated
-- as the source of truth for whether an address exists.
CREATE TABLE public.customer_address_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id text NOT NULL,
  shopify_address_id text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shopify_customer_id, shopify_address_id)
);
GRANT ALL ON public.customer_address_labels TO service_role;
ALTER TABLE public.customer_address_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to customer address labels" ON public.customer_address_labels FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER update_customer_address_labels_updated_at BEFORE UPDATE ON public.customer_address_labels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
