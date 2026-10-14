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
 * approves it in Shopify Admin (the website dashboard was removed;
* notification email below tells the team) before the real Shopify Company/CompanyContact/
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
export type B2BApplicationNotice = {
  companyName: string;
  gstNumber: string;
  contactName?: string;
  phone?: string;
  address?: BusinessAddressInput;
  customerId: string;
};

export async function saveBusinessRegistrationRecord(
  data: { companyName: string; gstNumber: string; contactName?: string; phone?: string; address?: BusinessAddressInput },
  customerId: string,
  // Cast to `any` by callers (columns ahead of the generated types).
  client: any,
  // Injected so tests can observe it; defaults to the real team email.
  notify: (notice: B2BApplicationNotice) => Promise<unknown> = notifyTeamOfB2BApplication,
): Promise<{ ok: true; status: "pending" }> {
  const { data: existingCompany } = await client
    .from("b2b_companies")
    .select("id")
    .eq("gst_number", data.gstNumber)
    .maybeSingle();
  // Read before writing so a retry/resubmit of an already-saved pending
  // application does not email the team a second time.
  const { data: previous } = await client
    .from("business_account_requests")
    .select("status")
    .eq("shopify_customer_id", customerId)
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
  if (previous?.status !== "pending") {
    // Never let an email problem fail the shopper's application.
    try {
      await notify({ ...data, customerId });
    } catch (err) {
      console.error("[B2B intake] team notification failed", err instanceof Error ? err.message : String(err));
    }
  }
  return { ok: true, status: "pending" };
}

const B2B_APPLICATION_RECIPIENT = "marketing@officeneed.in";

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Builds the team email. Contains only application details -- no tokens or passwords. */
export function buildB2BApplicationEmail(n: B2BApplicationNotice) {
  const numericId = n.customerId.startsWith("gid://shopify/Customer/") ? n.customerId.split("/").pop() : null;
  const link = numericId ? `https://admin.shopify.com/store/har1k4-di/customers/${numericId}` : null;
  const address = n.address
    ? [n.address.addressLine1, n.address.addressLine2, n.address.city, n.address.state, n.address.pin, n.address.country].filter(Boolean).join(", ")
    : "";
  const subject = `New B2B application: ${n.companyName} (${n.gstNumber})`;
  const html = `<h2>New business account application</h2>
<p>Approve it in Shopify Admin → Customers → Companies by adding this customer as a contact with a role at a location.</p>
<table cellpadding="6">
<tr><td><b>Company</b></td><td>${escapeHtml(n.companyName)}</td></tr>
<tr><td><b>GSTIN</b></td><td>${escapeHtml(n.gstNumber)}</td></tr>
<tr><td><b>Contact</b></td><td>${escapeHtml(n.contactName)}</td></tr>
<tr><td><b>Phone</b></td><td>${escapeHtml(n.phone)}</td></tr>
<tr><td><b>Address</b></td><td>${escapeHtml(address)}</td></tr>
<tr><td><b>Shopify customer</b></td><td>${link ? `<a href="${escapeHtml(link)}">Open in Shopify (ID ${escapeHtml(numericId)})</a>` : escapeHtml(n.customerId)}</td></tr>
</table>`;
  return { to: B2B_APPLICATION_RECIPIENT, subject, html };
}

async function notifyTeamOfB2BApplication(n: B2BApplicationNotice) {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.warn("[B2B intake] RESEND_API_KEY not set; application email skipped.");
    return;
  }
  const { Resend } = await import("resend");
  const email = buildB2BApplicationEmail(n);
  const { error } = await new Resend(apiKey).emails.send({
    from: process.env["EMAIL_FROM"] || "OfficeNeed Assistant <contact@officeneed.in>",
    to: email.to,
    subject: email.subject,
    html: email.html,
  });
  if (error) throw new Error(error.message);
}
