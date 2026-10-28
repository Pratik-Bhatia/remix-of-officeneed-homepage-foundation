// Persists a Buy Now purchase's full customization (logo, placement,
// dimensions, printing method, gift-set breakdown) to Supabase BEFORE
// checkout, and returns a compact reference (the record's own id) for
// ProductCustomizer.tsx's handleBuyNow to attach as a Shopify cart line
// attribute.
//
// This is the ONLY way customization data travels from a Buy Now purchase
// onto the real Shopify order: the cart line attribute becomes the
// order's line_item.property once paid, and the orders/paid webhook
// (src/lib/shopify-order-webhook.server.ts) reads that one id back to
// look up this FULL record -- never trying to reconstruct structured
// data (position, rotation, exact mm) by parsing text cart properties,
// which is fragile and was the previous approach here. Images stay as
// uploaded Supabase URLs either way; only the reference travels through
// Shopify.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getUploadClient } from "./attachments.server";
import { base64DecodedSize, MAX_IMAGE_BYTES, sniffImage } from "./upload-validation";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB, matches corporate-quotes.functions.ts

function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const buyNowCustomizationSchema = z.object({
  variantId: z.string(),
  productName: z.string().optional(),
  productVariant: z.string().optional(),
  quantity: z.number().int().positive(),
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
      x: z.number().optional(),
      y: z.number().optional(),
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
          position: z.object({ x: z.number(), y: z.number() }).optional(),
          rotation: z.number().optional(),
          flip: z.string().optional(),
          printingMethod: z.string().optional(), // this component's own method
          previewImage: z.string().optional(), // base64
        }),
      ]),
    )
    .optional(),
});

export type BuyNowCustomizationInput = z.infer<typeof buyNowCustomizationSchema>;
export type BuyNowCustomizationResult = { ok: true; recordId: string } | { ok: false; recordId: null };

/**
 * The actual upload-and-persist logic, factored out of the createServerFn
 * wrapper below so it's directly unit-testable with an injected fake
 * Supabase-like client -- createServerFn's own handler can't be invoked
 * outside the real server runtime (throws "No Start context found in
 * AsyncLocalStorage"), the same reason src/lib/shopify-order-webhook.server.ts
 * keeps its own logic in plain, non-createServerFn functions.
 */
export async function saveBuyNowCustomizationRecord(
  data: BuyNowCustomizationInput,
  client: ReturnType<typeof getUploadClient>,
): Promise<BuyNowCustomizationResult> {
    try {
      if (!client) {
        console.error("[BuyNowCustomization] Supabase client not configured -- proceeding without a saved record.");
        return { ok: false as const, recordId: null };
      }

      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);

      let logoUrl: string | null = null;
      if (data.logo) {
        const buffer = base64DecodedSize(data.logo.content) <= MAX_BYTES ? base64ToUint8Array(data.logo.content) : new Uint8Array();
        const logoType = sniffImage(buffer);
        if (buffer.length <= MAX_BYTES && logoType) {
          const safeName = data.logo.name.replace(/[^a-z0-9.]/gi, "_");
          const path = `buy-now/${timestamp}-${random}-logo-${safeName}`;
          const { error } = await client.storage.from("corporate-quote-assets").upload(path, buffer, { contentType: logoType.mimeType });
          if (!error) {
            logoUrl = client.storage.from("corporate-quote-assets").getPublicUrl(path).data.publicUrl;
          } else {
            console.error("[BuyNowCustomization] logo upload failed:", error);
          }
        }
      }

      let previewUrl: string | null = null;
      if (data.previewImage) {
        const base64Data = data.previewImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = base64DecodedSize(base64Data) <= MAX_IMAGE_BYTES ? base64ToUint8Array(base64Data) : new Uint8Array();
        const previewType = sniffImage(buffer);
        const path = `buy-now/${timestamp}-${random}-preview.png`;
        const { error } = previewType
          ? await client.storage.from("corporate-quote-assets").upload(path, buffer, { contentType: previewType.mimeType })
          : { error: new Error("Preview image missing, too large or not a valid image") };
        if (!error) {
          previewUrl = client.storage.from("corporate-quote-assets").getPublicUrl(path).data.publicUrl;
        } else {
          console.error("[BuyNowCustomization] preview upload failed:", error);
        }
      }

      // Multi-component gift sets: upload each customized component's own
      // preview, same pattern as the quote flow's componentPreviewUrls.
      const giftSetComponentData: Array<Record<string, unknown>> = [];
      if (data.giftSetCustomizations?.length) {
        for (const [i, comp] of data.giftSetCustomizations.entries()) {
          if (!comp.customized) {
            giftSetComponentData.push({ component: comp.component, customized: false });
            continue;
          }
          let componentPreviewUrl: string | null = null;
          if (comp.previewImage) {
            try {
              const base64Data = comp.previewImage.replace(/^data:image\/\w+;base64,/, "");
              if (base64DecodedSize(base64Data) > MAX_IMAGE_BYTES) throw new Error("preview too large");
              const buffer = base64ToUint8Array(base64Data);
              const componentType = sniffImage(buffer);
              if (!componentType) throw new Error("preview is not a valid image");
              const safeComponentName = comp.component.replace(/[^a-z0-9]/gi, "_").toLowerCase();
              const path = `buy-now/${timestamp}-${random}-component-${i}-${safeComponentName}.png`;
              const { error } = await client.storage.from("corporate-quote-assets").upload(path, buffer, { contentType: componentType.mimeType });
              if (!error) {
                componentPreviewUrl = client.storage.from("corporate-quote-assets").getPublicUrl(path).data.publicUrl;
              }
            } catch (err) {
              console.error(`[BuyNowCustomization] component preview upload failed (${comp.component}):`, err);
            }
          }
          giftSetComponentData.push({
            component: comp.component,
            customized: true,
            widthMm: comp.widthMm,
            heightMm: comp.heightMm,
            position: comp.position,
            rotation: comp.rotation,
            flip: comp.flip,
            printingMethod: comp.printingMethod,
            previewUrl: componentPreviewUrl,
          });
        }
      }

      const { data: inserted, error: insertError } = await client
        .from("buy_now_customization_records")
        .insert({
          shopify_variant_id: data.variantId,
          product_name: data.productName ?? null,
          product_variant: data.productVariant ?? null,
          quantity: data.quantity,
          printing_method: data.printingMethod ?? null,
          logo_filename: data.logo?.name ?? null,
          logo_url: logoUrl,
          logo_width_mm: data.logo?.widthMm ?? null,
          logo_height_mm: data.logo?.heightMm ?? null,
          logo_position_x: data.logo?.x ?? null,
          logo_position_y: data.logo?.y ?? null,
          logo_rotation: data.logo?.rotation ?? null,
          logo_flip_horizontal: data.logo?.flipH ?? false,
          logo_flip_vertical: data.logo?.flipV ?? false,
          preview_image_url: previewUrl,
          customization_data: giftSetComponentData.length ? giftSetComponentData : null,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        console.error("[BuyNowCustomization] failed to save customization record:", insertError);
        return { ok: false as const, recordId: null };
      }

      return { ok: true as const, recordId: inserted.id as string };
    } catch (e: any) {
      console.error("[BuyNowCustomization] unexpected error:", e);
      return { ok: false as const, recordId: null };
    }
}

export const saveBuyNowCustomization = createServerFn({ method: "POST" })
  .validator((data) => buyNowCustomizationSchema.parse(data))
  .handler(async ({ data }) => saveBuyNowCustomizationRecord(data, getUploadClient()));
