/**
 * Handles the Company tab's business registration form: creates (or
 * reuses) the real Shopify Company + Company Location for this GST, then
 * stores a 'pending' application row in Supabase pointing at it.
 *
 * Restores the original behavior (company visible in Shopify Admin ->
 * Customers -> Companies immediately) while keeping what manual-approval
 * requires: this NEVER assigns the customer as a Company Contact or
 * grants any role -- see src/lib/b2b-company-setup.functions.ts's
 * findOrCreateShopifyCompany, which creates/reuses the Company+Location
 * only. B2B purchasing access is derived exclusively from Customer ->
 * CompanyContact -> RoleAssignment -> CompanyLocation
 * (src/lib/b2b.functions.ts) -- a Company with zero contacts grants no
 * one access, so an admin must still manually add the customer as a
 * contact, assign their role, and configure catalog/payment terms
 * directly in Shopify Admin before they can buy at B2B pricing.
 *
 * GSTIN and company name are supported Shopify fields, not invented
 * ones: GSTIN is stored as both Company.externalId (this flow's own
 * dedup key -- confirmed live that a merchant-configured Company never
 * has one) and CompanyLocation.taxRegistrationId (the "Tax ID" field
 * visible on the Company Location's own Shopify Admin page); company
 * name is Company.name. Business address, when supplied (currently only
 * the fuller "upgrade" form collects one -- the compact fresh-
 * registration form doesn't), is stored as both billing and shipping on
 * the Company Location via companyLocationAssignAddress.
 *
 * Idempotent and retry-safe end to end: findOrCreateShopifyCompany looks
 * up the Company by GST before ever creating one, so a retried
 * registration (after a Shopify timeout, a Supabase failure, or a second
 * person registering under the same GST) reuses the existing Company
 * instead of duplicating it; the Supabase upsert below is keyed on
 * shopify_customer_id, so a retry for the SAME customer updates the same
 * application row rather than creating a second one.
 *
 * No custom email is ever sent here, to the customer or to anyone else
 * -- the only notification involved anywhere in this flow is Shopify's
 * own automatic "Welcome to [store]" customer-account email, sent when
 * the Shopify customer itself was created (src/lib/customer.ts), which
 * this function has no control over and never duplicates.
 */
import { createServerFn } from "@tanstack/react-start";
import { resolveCustomerId } from "@/lib/saves.server";
import { isValidGstin, normalizeGstin } from "@/lib/gst";
import { toIndiaZoneCode } from "@/lib/india-zones";
import { findOrCreateShopifyCompany } from "@/lib/b2b-company-setup.functions";

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
 * The actual intake logic, factored out of the createServerFn wrapper
 * above so it's directly unit-testable with injected fake Shopify/
 * Supabase-like clients and a pre-resolved customerId -- same pattern as
 * src/lib/buy-now-customization.functions.ts's saveBuyNowCustomizationRecord
 * (createServerFn's own handler can't be invoked outside the real server
 * runtime in node:test).
 *
 * `shopify` defaults to the real findOrCreateShopifyCompany; tests inject
 * a fake so no real Shopify Admin API call happens.
 */
export async function saveBusinessRegistrationRecord(
  data: { companyName: string; gstNumber: string; contactName?: string; phone?: string; address?: BusinessAddressInput },
  customerId: string,
  // Cast to `any` by callers (columns ahead of the generated types).
  client: any,
  shopify: typeof findOrCreateShopifyCompany = findOrCreateShopifyCompany,
): Promise<{ ok: true; status: "pending" }> {
  // 1. Find-or-create the real Shopify Company + Location for this GST --
  // Company/Location only, never a contact or role (see this file's own
  // header comment and findOrCreateShopifyCompany's). This is what makes
  // the application immediately visible in Shopify Admin -> Customers ->
  // Companies, which is the actual requirement here -- not just a
  // Supabase row. If this throws (including a Shopify timeout), the
  // whole call fails and the caller's existing retry/draft mechanism
  // (CustomerAuthModal.tsx) takes over -- findOrCreateShopifyCompany's
  // own GST-keyed lookup-before-create makes that retry safe, never
  // creating a duplicate Company.
  const provisioned = await shopify({
    companyName: data.companyName,
    gstNumber: data.gstNumber,
    contactName: data.contactName || data.companyName,
    ...(data.phone ? { phone: data.phone } : {}),
    ...(data.address ? { address: data.address } : {}),
  });

  // 2. Mirror the Shopify Company into b2b_companies (gst_number UNIQUE
  // already prevents a duplicate row for the same GST) so the pending
  // application below can reference it -- purely a cross-reference for
  // whoever looks at this table; it is NEVER consulted to grant access
  // (see b2b.functions.ts's resolveB2BSession, which only ever reads the
  // live Shopify Customer -> Contact -> Role -> Location chain). Reuses
  // the row a prior attempt for the same GST already created, rather
  // than inserting a second one, on retry or for a second applicant
  // under a known company.
  const { data: existingCompanyRow, error: lookupError } = await client
    .from("b2b_companies")
    .select("id")
    .eq("gst_number", data.gstNumber)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  let companyRowId: string | null = existingCompanyRow?.id ?? null;
  if (!companyRowId) {
    const { data: inserted, error: insertError } = await client
      .from("b2b_companies")
      .insert({
        gst_number: data.gstNumber,
        company_name: data.companyName,
        shopify_company_id: provisioned.companyId,
        shopify_company_location_id: provisioned.companyLocationId,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    companyRowId = inserted.id;
  }

  // 3. Save the pending application itself, linked to that company row.
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
      b2b_company_id: companyRowId,
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
