-- Persisted customization record for a Buy Now purchase (see
-- src/lib/buy-now-customization.functions.ts), replacing the earlier
-- approach of cramming logo/placement details into Shopify cart line
-- attribute VALUES as formatted text (fragile: attribute values are
-- length-limited, and reconstructing structured data like position/
-- rotation/dimensions from parsed strings is lossy and error-prone).
--
-- This row is created BEFORE checkout, while the customer is still on
-- the customizer modal. Only its own `id` (a compact UUID, well within
-- any cart-attribute length limit) is attached to the standalone
-- checkout's cart line as the "_Customization Record" attribute. Shopify
-- carries that attribute through onto the real order's line_item
-- properties once paid; the orders/paid webhook
-- (src/lib/shopify-order-webhook.server.ts) reads that one id back and
-- looks up the FULL record here to build the internal "Paid Online" PDF
-- -- never trying to reconstruct it from text properties again.
--
-- Lifecycle: created 'pending' at Buy Now time. The webhook marks it
-- 'fulfilled' (and sets shopify_order_id) once its PDF has been
-- generated and emailed. If the customer abandons checkout or payment
-- fails, the row is simply never claimed and stays 'pending' --
-- deliberately NOT deleted here (no code in this project runs scheduled
-- jobs), so it can still be matched to a LATER order if the customer
-- completes payment afterwards. Recommended cleanup policy for an
-- operator-run job, not built as part of this change: rows still
-- 'pending' more than ~30 days after `created_at` are abandoned-checkout
-- residue and safe to delete.
CREATE TABLE public.buy_now_customization_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_variant_id text NOT NULL,
  product_name text,
  product_variant text,
  quantity integer,
  printing_method text,
  logo_filename text,
  logo_url text,
  logo_width_mm numeric,
  logo_height_mm numeric,
  logo_position_x numeric,
  logo_position_y numeric,
  logo_rotation numeric,
  logo_flip_horizontal boolean NOT NULL DEFAULT false,
  logo_flip_vertical boolean NOT NULL DEFAULT false,
  preview_image_url text,
  -- Multi-component gift sets: one entry per component, same shape as
  -- corporate_quote_requests.customization_data (component name,
  -- customized flag, size, position/rotation/flip, its own preview URL).
  customization_data jsonb,
  status text NOT NULL DEFAULT 'pending',
  shopify_order_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buy_now_customization_records_status_check CHECK (status IN ('pending', 'fulfilled', 'expired'))
);
CREATE INDEX buy_now_customization_records_status_idx ON public.buy_now_customization_records (status);
GRANT ALL ON public.buy_now_customization_records TO service_role;
ALTER TABLE public.buy_now_customization_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access to buy now customization records" ON public.buy_now_customization_records FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER update_buy_now_customization_records_updated_at BEFORE UPDATE ON public.buy_now_customization_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
