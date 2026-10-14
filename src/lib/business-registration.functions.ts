/**
 * Stores the company name / GST number a shopper supplies on the Company
 * tab's business registration form -- see
 * supabase/migrations/20261002120000_add_business_account_requests.sql and
 * 20261014140000_restore_b2b_manual_approval.sql for why this lives in
 * Supabase rather than Shopify (Storefront API has no field for company
 * name/GST, and writing them as Shopify customer metafields would need an
 * Admin API scope -- write_customers -- that isn't granted).
 *
 * This is now the ONLY thing that happens at registration time -- it is
 * the real, sole entry point into the manual-approval queue. The row is
 * always written 'pending' (the table's own DB default); this function
 * never grants B2B pricing and never touches Shopify at all. An admin
 * must explicitly approve it (src/lib/admin-b2b.functions.ts's
 * approveB2BApplication) before the real Shopify Company/CompanyContact/
 * Role relationship is created -- B2B eligibility still comes exclusively
 * from that real Shopify relationship (src/lib/b2b.functions.ts), never
 * from this table.
 *
 * If this GST already belongs to an approved company (b2b_companies),
 * `b2b_company_id` is set here purely so the admin dashboard can show "new
 * contact for an existing company" context -- it is NEVER treated as
 * authorization: a second contact for a known company still needs its own
 * explicit admin approval before getting access, exactly like a brand-new
 * company does.
 */
import { createServerFn } from "@tanstack/react-start";
import { resolveCustomerId } from "@/lib/saves.server";
import { isValidGstin, normalizeGstin } from "@/lib/gst";
import { toIndiaZoneCode } from "@/lib/india-zones";

type BusinessAddressInput = { addressLine1: string; addressLine2?: string; city: string; state: string; pin: string; country: string };

export const saveBusinessRegistration = createServerFn({ method: "POST" })
  .inputValidator((input: {
    token: string;
    companyName: string;
    gstNumber: string;
    contactName?: string;
    phone?: string;
    // Only the "upgrade" (already-signed-in customer adding a business)
    // form collects this -- the compact fresh-registration form doesn't.
    // Stored as-is and applied to the real Shopify Company Location only
    // once an admin approves (src/lib/admin-b2b.functions.ts), same as
    // every other field here.
    address?: BusinessAddressInput;
  }) => {
    if (!input?.token || typeof input.token !== "string") {
      throw new Error("Missing session token.");
    }
    const companyName = input.companyName?.trim();
    if (!companyName) throw new Error("Company name is required.");
    if (companyName.length > 200) throw new Error("Company name is too long.");
    // Required and format-validated server-side too -- the UI already
    // blocks submission on a missing/invalid GSTIN, but never trust that
    // alone (a client could call this function directly).
    const gstNumberRaw = input.gstNumber?.trim() ?? "";
    if (!gstNumberRaw) throw new Error("GST number is required.");
    if (!isValidGstin(gstNumberRaw)) throw new Error("GST number is not a valid GSTIN.");
    const gstNumber = normalizeGstin(gstNumberRaw);
    const contactName = input.contactName?.trim() || undefined;
    const phone = input.phone?.trim() || undefined;

    let address: BusinessAddressInput | undefined;
    if (input.address) {
      const addressLine1 = input.address.addressLine1?.trim() ?? "";
      const addressLine2 = input.address.addressLine2?.trim() || undefined;
      const city = input.address.city?.trim() ?? "";
      const stateRaw = input.address.state?.trim() ?? "";
      const state = stateRaw ? toIndiaZoneCode(stateRaw) : "";
      if (state === null) throw new Error("Please enter a valid Indian state (e.g. Maharashtra).");
      const pin = input.address.pin?.trim() ?? "";
      const country = input.address.country?.trim() ?? "";
      // Only validated/stored if ALL fields are present -- a partially
      // filled address is dropped rather than stored incomplete, same
      // standard the old setupB2BCompany applied before this was moved
      // here (an empty/partial address must never reach Shopify later).
      if (addressLine1 && city && state && pin && country) {
        if (country.trim().toLowerCase() !== "india") {
          throw new Error("Only India is currently supported for Company registration addresses.");
        }
        address = { addressLine1, ...(addressLine2 ? { addressLine2 } : {}), city, state, pin, country };
      }
    }

    return {
      token: input.token,
      companyName,
      gstNumber,
      ...(contactName ? { contactName } : {}),
      ...(phone ? { phone } : {}),
      ...(address ? { address } : {}),
    };
  })
  .handler(async ({ data }): Promise<{ ok: true; status: "pending" }> => {
    // The token is the only proof of identity we trust -- never accept a
    // client-supplied customer id (same rule b2b.functions.ts follows).
    let customerId = "unresolved";
    try {
      customerId = await resolveCustomerId(data.token);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return await saveBusinessRegistrationRecord(data, customerId, supabaseAdmin as any);
    } catch (err) {
      // Log the real cause server-side only (no token / password). The
      // shopper only ever sees a generic message.
      console.error("[B2B intake] FAILED", { customerId, error: err instanceof Error ? err.message : String(err) });
      throw new Error("BUSINESS_APPLICATION_FAILED");
    }
  });

/**
 * The actual intake-write logic, factored out of the createServerFn
 * wrapper above so it's directly unit-testable with an injected fake
 * Supabase-like client and a pre-resolved customerId -- same pattern as
 * src/lib/buy-now-customization.functions.ts's saveBuyNowCustomizationRecord
 * (createServerFn's own handler can't be invoked outside the real server
 * runtime in node:test).
 */
export async function saveBusinessRegistrationRecord(
  data: { companyName: string; gstNumber: string; contactName?: string; phone?: string; address?: BusinessAddressInput },
  customerId: string,
  // Cast to `any` by callers: b2b_companies and business_account_requests'
  // new columns (status/b2b_company_id/contact_name/phone/address.../...)
  // were added in 20261014140000_restore_b2b_manual_approval.sql, not yet
  // reflected in the generated Database type -- same convention
  // admin-quotes.functions.ts already uses for a table it queries ahead
  // of a type regen.
  client: any,
): Promise<{ ok: true; status: "pending" }> {
  const { data: existingCompany } = await client
    .from("b2b_companies")
    .select("id")
    .eq("gst_number", data.gstNumber)
    .maybeSingle();
  const { error } = await client.from("business_account_requests").upsert(
    {
      shopify_customer_id: customerId,
      company_name: data.companyName,
      gst_number: data.gstNumber,
      contact_name: data.contactName ?? null,
      phone: data.phone ?? null,
      address_line1: data.address?.addressLine1 ?? null,
      address_line2: data.address?.addressLine2 ?? null,
      city: data.address?.city ?? null,
      state: data.address?.state ?? null,
      pin: data.address?.pin ?? null,
      country: data.address?.country ?? null,
      b2b_company_id: existingCompany?.id ?? null,
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
    },
    { onConflict: "shopify_customer_id" },
  );
  if (error) throw new Error(error.message);
  return { ok: true, status: "pending" };
}
