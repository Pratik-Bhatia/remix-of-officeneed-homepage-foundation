import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const enquirySchema = z.object({
  productSlug: z.string().min(1),
  productName: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  name: z.string().min(1).max(120),
  company: z.string().max(160).optional(),
  email: z.string().email(),
  message: z.string().min(1).max(4000),
});

/**
 * Public B2B product enquiry submission. No auth required — anyone visiting
 * the storefront can request a quote. Uses the publishable (anon) key so RLS
 * applies: only the anon INSERT policy on product_enquiries is honoured.
 */
export const submitEnquiry = createServerFn({ method: "POST" })
  .validator((data) => enquirySchema.parse(data))
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) {
      throw new Error("Enquiry submission is not configured. Connect the backend in Lovable Cloud.");
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.from("product_enquiries").insert({
      product_slug: data.productSlug,
      product_name: data.productName,
      category: data.category,
      quantity: data.quantity ?? null,
      name: data.name,
      company: data.company ?? null,
      email: data.email,
      message: data.message,
      status: "new",
    });

    if (error) {
      console.error("[OfficeNeed] enquiry insert failed", error);
      return { ok: false as const, error: "Could not submit your enquiry. Please try again." };
    }

    return { ok: true as const };
  });
