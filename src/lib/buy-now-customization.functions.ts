// Uploads a Buy Now purchase's customization (logo + rendered preview) to
// the same Supabase storage bucket the quote flow already uses, and
// returns a compact set of plain-text key/value pairs suitable for
// Shopify cart line attributes (ProductCustomizer.tsx's handleBuyNow
// attaches these to the cart line before checkout -- see
// src/stores/cartStore.ts's CartItem.lineAttributes).
//
// This is the ONLY way customization data travels from a Buy Now purchase
// onto the real Shopify order: cart line attributes become the order's
// line_item.properties, which the orders/paid webhook
// (src/lib/shopify-order-webhook.server.ts) reads back to build the
// internal paid-order PDF. Images themselves can't go in cart attributes
// (plain text only, length-limited), so only their uploaded public URLs
// are attached -- the actual bytes live in Supabase, same as a quote's.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getUploadClient } from "./attachments.server";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB, matches corporate-quotes.functions.ts

function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Shopify's cart/order line-item property value has a practical length
// limit -- a public Supabase URL comfortably fits, but truncate defensively
// so a long value can never fail the cartLinesAdd/cartCreate mutation.
const MAX_ATTRIBUTE_VALUE_LENGTH = 250;
function clampAttributeValue(value: string): string {
  return value.length > MAX_ATTRIBUTE_VALUE_LENGTH ? value.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH - 1) + "…" : value;
}

const buyNowAssetsSchema = z.object({
  printingMethod: z.string().optional(),
  logo: z
    .object({
      name: z.string(),
      mimeType: z.string(),
      content: z.string(), // base64
      scale: z.number().optional(),
      rotation: z.number().optional(),
      flipH: z.boolean().optional(),
      flipV: z.boolean().optional(),
      widthMm: z.number().optional(),
      heightMm: z.number().optional(),
    })
    .optional(),
  previewImage: z.string().optional(), // base64
  giftSetCustomizations: z
    .array(
      z.discriminatedUnion("customized", [
        z.object({ component: z.string(), customized: z.literal(false) }),
        z.object({
          component: z.string(),
          customized: z.literal(true),
          widthMm: z.number().optional(),
          heightMm: z.number().optional(),
          previewImage: z.string().optional(), // base64
        }),
      ]),
    )
    .optional(),
});

export const uploadBuyNowCustomizationAssets = createServerFn({ method: "POST" })
  .validator((data) => buyNowAssetsSchema.parse(data))
  .handler(async ({ data }) => {
    const attributes: Array<{ key: string; value: string }> = [];
    try {
      const client = getUploadClient();
      if (!client) {
        // No storage configured -- still let the purchase proceed with
        // whatever plain-text metadata we have (printing method), just
        // without image URLs. Never blocks checkout.
        if (data.printingMethod) attributes.push({ key: "Printing Method", value: clampAttributeValue(data.printingMethod) });
        return { ok: true as const, attributes };
      }

      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);

      if (data.printingMethod) attributes.push({ key: "Printing Method", value: clampAttributeValue(data.printingMethod) });

      if (data.logo) {
        const buffer = base64ToUint8Array(data.logo.content);
        if (buffer.length <= MAX_BYTES) {
          const safeName = data.logo.name.replace(/[^a-z0-9.]/gi, "_");
          const path = `buy-now/${timestamp}-${random}-logo-${safeName}`;
          const { error } = await client.storage.from("corporate-quote-assets").upload(path, buffer, { contentType: data.logo.mimeType });
          if (!error) {
            const { data: publicUrlData } = client.storage.from("corporate-quote-assets").getPublicUrl(path);
            attributes.push({ key: "_Logo File", value: clampAttributeValue(data.logo.name) });
            attributes.push({ key: "_Logo Image", value: clampAttributeValue(publicUrlData.publicUrl) });
            if (typeof data.logo.widthMm === "number" && typeof data.logo.heightMm === "number") {
              attributes.push({ key: "_Logo Size (mm)", value: `${data.logo.widthMm.toFixed(1)} x ${data.logo.heightMm.toFixed(1)}` });
            }
            if (typeof data.logo.rotation === "number" && data.logo.rotation !== 0) {
              attributes.push({ key: "_Logo Rotation", value: `${data.logo.rotation}°` });
            }
          } else {
            console.error("[BuyNowAssets] logo upload failed:", error);
          }
        }
      }

      if (data.previewImage) {
        const base64Data = data.previewImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = base64ToUint8Array(base64Data);
        const path = `buy-now/${timestamp}-${random}-preview.png`;
        const { error } = await client.storage.from("corporate-quote-assets").upload(path, buffer, { contentType: "image/png" });
        if (!error) {
          const { data: publicUrlData } = client.storage.from("corporate-quote-assets").getPublicUrl(path);
          attributes.push({ key: "_Customization Preview", value: clampAttributeValue(publicUrlData.publicUrl) });
        } else {
          console.error("[BuyNowAssets] preview upload failed:", error);
        }
      }

      // Multi-component gift sets: one compact attribute per customized
      // component (name + size + its own preview URL), so the order shows
      // exactly which items in the set were branded -- same reasoning as
      // the quote PDF's own per-component breakdown, just condensed into
      // plain-text line properties instead of a document section.
      if (data.giftSetCustomizations?.length) {
        for (const [i, comp] of data.giftSetCustomizations.entries()) {
          if (!comp.customized) continue;
          let previewUrl = "";
          if (comp.previewImage) {
            try {
              const base64Data = comp.previewImage.replace(/^data:image\/\w+;base64,/, "");
              const buffer = base64ToUint8Array(base64Data);
              const safeComponentName = comp.component.replace(/[^a-z0-9]/gi, "_").toLowerCase();
              const path = `buy-now/${timestamp}-${random}-component-${i}-${safeComponentName}.png`;
              const { error } = await client.storage.from("corporate-quote-assets").upload(path, buffer, { contentType: "image/png" });
              if (!error) {
                const { data: publicUrlData } = client.storage.from("corporate-quote-assets").getPublicUrl(path);
                previewUrl = publicUrlData.publicUrl;
              }
            } catch (err) {
              console.error(`[BuyNowAssets] component preview upload failed (${comp.component}):`, err);
            }
          }
          const sizeStr = comp.widthMm && comp.heightMm ? `, ${comp.widthMm.toFixed(1)}x${comp.heightMm.toFixed(1)}mm` : "";
          attributes.push({
            key: `_Component: ${comp.component}`,
            value: clampAttributeValue(`Customized${sizeStr}${previewUrl ? `, ${previewUrl}` : ""}`),
          });
        }
      }

      return { ok: true as const, attributes };
    } catch (e: any) {
      console.error("[BuyNowAssets] unexpected error:", e);
      // Never blocks the purchase -- Buy Now proceeds with whatever
      // attributes were collected before the failure (possibly none).
      return { ok: true as const, attributes };
    }
  });
