/**
 * Stores the company name / GST number a shopper supplies on the Company
 * tab's business registration form -- see
 * supabase/migrations/20261002120000_add_business_account_requests.sql for
 * why this lives in Supabase rather than Shopify (Storefront API has no
 * field for either, and writing them as Shopify customer metafields would
 * need an Admin API scope -- write_customers -- that isn't granted).
 *
 * This NEVER grants B2B pricing. It is purely intake data for the merchant
 * to review and then set up the real Company/CompanyContact/Role
 * Assignment in Shopify Admin -- B2B eligibility still comes exclusively
 * from that real Shopify relationship (src/lib/b2b.functions.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { resolveCustomerId } from "@/lib/saves.server";

export const saveBusinessRegistration = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; companyName: string; gstNumber?: string }) => {
    if (!input?.token || typeof input.token !== "string") {
      throw new Error("Missing session token.");
    }
    const companyName = input.companyName?.trim();
    if (!companyName) throw new Error("Company name is required.");
    if (companyName.length > 200) throw new Error("Company name is too long.");
    const gstNumber = input.gstNumber?.trim() || undefined;
    if (gstNumber && gstNumber.length > 30) throw new Error("GST number is too long.");
    return { token: input.token, companyName, gstNumber };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    // The token is the only proof of identity we trust -- never accept a
    // client-supplied customer id (same rule b2b.functions.ts follows).
    const customerId = await resolveCustomerId(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("business_account_requests")
      .upsert(
        { shopify_customer_id: customerId, company_name: data.companyName, gst_number: data.gstNumber ?? null },
        { onConflict: "shopify_customer_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
