import { toIndiaZoneCode } from "./india-zones";
/**
 * Read/update the authenticated B2B customer's own Company Location
 * details (business address, contact name/phone, GST) -- powers the
 * Business Account section's display and "Edit Details" action.
 *
 * TRUST MODEL, same as every other B2B server function in this app: the
 * browser sends its customerAccessToken (and, optionally, which of its
 * resolved locations it currently has selected -- a hint, never an
 * authorization). The server re-derives the customer's ACTUAL assigned
 * company locations from the token via resolveCompanyLocationsForCustomer
 * (b2b.functions.ts) every time, and only ever operates on a location id
 * that's actually in that server-resolved list. A client-supplied
 * companyLocationId that isn't in that list is silently ignored, never
 * trusted -- a customer can only ever read/edit a location they're
 * actually assigned to.
 */
import { createServerFn } from "@tanstack/react-start";
import { adminGraphQLRequest } from "@/lib/shopify-admin.server";
import { resolveCustomerIdFromToken, resolveCompanyLocationsForCustomer } from "@/lib/b2b.functions";

export type B2BLocationDetails = {
  companyLocationId: string;
  companyName: string;
  locationName: string;
  gstNumber: string | null;
  contactName: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
  country: string | null;
};

const LOCATION_DETAILS_QUERY = `
  query GetLocationDetails($id: ID!) {
    companyLocation(id: $id) {
      id
      name
      phone
      company { id name }
      taxSettings { taxRegistrationId }
      billingAddress { address1 address2 city zoneCode zip countryCode recipient phone }
    }
  }
`;

type LocationDetailsData = {
  companyLocation: {
    id: string;
    name: string;
    phone: string | null;
    company: { id: string; name: string };
    taxSettings: { taxRegistrationId: string | null } | null;
    billingAddress: {
      address1: string | null;
      address2: string | null;
      city: string | null;
      zoneCode: string | null;
      zip: string | null;
      countryCode: string | null;
      recipient: string | null;
      phone: string | null;
    } | null;
  } | null;
};

/** Re-resolves the customer's identity and assigned locations from their
 * token, then returns the customer id plus whichever location id is safe
 * to use (client hint only if it's in the server-resolved list). */
async function resolveAuthorizedCustomer(customerAccessToken: string, requestedLocationId?: string) {
  const customerId = await resolveCustomerIdFromToken(customerAccessToken);
  if (!customerId) throw new Error("Could not verify the signed-in customer.");
  const locations = await resolveCompanyLocationsForCustomer(customerId);
  if (locations.length === 0) throw new Error("No business account is linked to this customer.");
  const companyLocationId =
    requestedLocationId && locations.some((l) => l.id === requestedLocationId) ? requestedLocationId : locations[0]!.id;
  return { customerId: String(customerId), companyLocationId };
}

type OwnDetailsRow = {
  company_name: string | null;
  location_name: string | null;
  contact_name: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
};

/** ARCHITECTURE: the shared company/location is ONLY the B2B pricing
 * association (and GSTIN). Displayed/editable business details are stored
 * per Shopify customer in customer_business_details and never written back
 * to the shared company or location, so customers sharing a GSTIN never see
 * or modify each other's details. Shared location values are used only as
 * an initial fallback for fields the customer hasn't set yet. */
async function loadSharedLocation(companyLocationId: string) {
  const result = await adminGraphQLRequest<LocationDetailsData>(LOCATION_DETAILS_QUERY, { id: companyLocationId });
  if (result.errors?.length) {
    throw new Error("Could not load your business account details.");
  }
  const location = result.data?.companyLocation;
  if (!location) throw new Error("Could not load your business account details.");
  return location;
}

async function loadOwnDetails(customerId: string): Promise<OwnDetailsRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("customer_business_details")
    .select("company_name, location_name, contact_name, phone, address1, address2, city, state, pin")
    .eq("shopify_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error("Could not load your business account details.");
  return data;
}

function mergeDetails(
  companyLocationId: string,
  location: NonNullable<LocationDetailsData["companyLocation"]>,
  own: OwnDetailsRow | null,
): B2BLocationDetails {
  const addr = location.billingAddress;
  return {
    companyLocationId,
    companyName: own?.company_name ?? location.company.name,
    locationName: own?.location_name ?? location.name,
    gstNumber: location.taxSettings?.taxRegistrationId ?? null,
    contactName: own?.contact_name ?? addr?.recipient ?? null,
    phone: own?.phone ?? addr?.phone ?? location.phone ?? null,
    address1: own?.address1 ?? addr?.address1 ?? null,
    address2: own ? own.address2 : addr?.address2 ?? null,
    city: own?.city ?? addr?.city ?? null,
    state: own?.state ?? addr?.zoneCode ?? null,
    pin: own?.pin ?? addr?.zip ?? null,
    country: "India",
  };
}

export const getB2BLocationDetails = createServerFn({ method: "POST" })
  .inputValidator((input: { customerAccessToken: string; companyLocationId?: string }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing session token.");
    }
    return { customerAccessToken: input.customerAccessToken, companyLocationId: input.companyLocationId };
  })
  .handler(async ({ data }): Promise<B2BLocationDetails> => {
    const { customerId, companyLocationId } = await resolveAuthorizedCustomer(data.customerAccessToken, data.companyLocationId);
    const [location, own] = await Promise.all([loadSharedLocation(companyLocationId), loadOwnDetails(customerId)]);
    return mergeDetails(companyLocationId, location, own);
  });

export const updateB2BLocationDetails = createServerFn({ method: "POST" })
  .inputValidator((input: {
    customerAccessToken: string;
    companyLocationId?: string;
    companyName?: string;
    locationName?: string;
    contactName?: string;
    phone?: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    pin: string;
  }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing session token.");
    }
    const req = (v: string | undefined, label: string, max = 255) => {
      const t = v?.trim();
      if (!t) throw new Error(`${label} is required.`);
      if (t.length > max) throw new Error(`${label} is too long.`);
      return t;
    };
    const opt = (v: string | undefined, label: string, max = 255) => {
      const t = v?.trim();
      if (t && t.length > max) throw new Error(`${label} is too long.`);
      return t || undefined;
    };
    const stateRaw = req(input.state, "State");
    const state = toIndiaZoneCode(stateRaw);
    if (!state) throw new Error("Please enter a valid Indian state (e.g. Maharashtra).");
    return {
      customerAccessToken: input.customerAccessToken,
      companyLocationId: input.companyLocationId,
      companyName: opt(input.companyName, "Company name"),
      locationName: opt(input.locationName, "Location name"),
      contactName: opt(input.contactName, "Contact name"),
      phone: opt(input.phone, "Phone", 30),
      address1: req(input.address1, "Address Line 1"),
      address2: opt(input.address2, "Address Line 2"),
      city: req(input.city, "City", 120),
      state,
      pin: req(input.pin, "PIN / Postal Code", 12),
    };
  })
  .handler(async ({ data }): Promise<B2BLocationDetails> => {
    const { customerId, companyLocationId } = await resolveAuthorizedCustomer(data.customerAccessToken, data.companyLocationId);
    const location = await loadSharedLocation(companyLocationId);
    // Location name / contact are no longer collected in the customer UI;
    // keep whatever this customer already had stored rather than wiping it.
    const existingOwn = await loadOwnDetails(customerId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      shopify_customer_id: customerId,
      company_name: data.companyName ?? location.company.name,
      location_name: data.locationName ?? existingOwn?.location_name ?? null,
      contact_name: data.contactName ?? existingOwn?.contact_name ?? null,
      phone: data.phone ?? null,
      address1: data.address1,
      address2: data.address2 ?? null,
      city: data.city,
      state: data.state,
      pin: data.pin,
    };
    const { error } = await supabaseAdmin
      .from("customer_business_details")
      .upsert(row, { onConflict: "shopify_customer_id" });
    if (error) throw new Error("Could not update your business account details.");
    return mergeDetails(companyLocationId, location, row);
  });
