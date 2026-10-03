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
import { isValidGstin, normalizeGstin } from "@/lib/gst";

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

/** Re-resolves the customer's assigned locations from their token, then
 * returns whichever id is safe to use: the client's hint if (and only if)
 * it's actually in that list, else the customer's first assigned
 * location. Shared by both server functions below. */
async function resolveAuthorizedLocationId(customerAccessToken: string, requestedLocationId?: string): Promise<string> {
  const customerId = await resolveCustomerIdFromToken(customerAccessToken);
  if (!customerId) throw new Error("Could not verify the signed-in customer.");
  const locations = await resolveCompanyLocationsForCustomer(customerId);
  if (locations.length === 0) throw new Error("No business account is linked to this customer.");
  const authorized = requestedLocationId && locations.some((l) => l.id === requestedLocationId) ? requestedLocationId : locations[0]!.id;
  return authorized;
}

export const getB2BLocationDetails = createServerFn({ method: "POST" })
  .inputValidator((input: { customerAccessToken: string; companyLocationId?: string }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing session token.");
    }
    return { customerAccessToken: input.customerAccessToken, companyLocationId: input.companyLocationId };
  })
  .handler(async ({ data }): Promise<B2BLocationDetails> => {
    const companyLocationId = await resolveAuthorizedLocationId(data.customerAccessToken, data.companyLocationId);

    const result = await adminGraphQLRequest<LocationDetailsData>(LOCATION_DETAILS_QUERY, { id: companyLocationId });
    if (result.errors?.length) {
      throw new Error(`Could not load your business account details: ${result.errors.map((e) => e.message).join("; ")}`);
    }
    const location = result.data?.companyLocation;
    if (!location) throw new Error("Could not load your business account details.");

    const addr = location.billingAddress;
    return {
      companyLocationId: location.id,
      companyName: location.company.name,
      locationName: location.name,
      gstNumber: location.taxSettings?.taxRegistrationId ?? null,
      contactName: addr?.recipient ?? null,
      phone: addr?.phone ?? location.phone ?? null,
      address1: addr?.address1 ?? null,
      address2: addr?.address2 ?? null,
      city: addr?.city ?? null,
      state: addr?.zoneCode ?? null,
      pin: addr?.zip ?? null,
      country: addr?.countryCode === "IN" ? "India" : addr?.countryCode ?? null,
    };
  });

const LOCATION_UPDATE_MUTATION = `
  mutation UpdateLocation($companyLocationId: ID!, $input: CompanyLocationUpdateInput!) {
    companyLocationUpdate(companyLocationId: $companyLocationId, input: $input) {
      companyLocation { id }
      userErrors { message field }
    }
  }
`;

const ASSIGN_ADDRESS_MUTATION = `
  mutation AssignAddress($locationId: ID!, $address: CompanyAddressInput!, $addressTypes: [CompanyAddressType!]!) {
    companyLocationAssignAddress(locationId: $locationId, address: $address, addressTypes: $addressTypes) {
      companyAddress { id }
      userErrors { message field }
    }
  }
`;

const TAX_SETTINGS_UPDATE_MUTATION = `
  mutation UpdateTaxSettings($companyLocationId: ID!, $taxRegistrationId: String) {
    companyLocationTaxSettingsUpdate(companyLocationId: $companyLocationId, taxRegistrationId: $taxRegistrationId) {
      companyLocation { id }
      userErrors { message field }
    }
  }
`;

export const updateB2BLocationDetails = createServerFn({ method: "POST" })
  .inputValidator((input: {
    customerAccessToken: string;
    companyLocationId?: string;
    locationName: string;
    contactName: string;
    phone?: string;
    gstNumber?: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    pin: string;
  }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing session token.");
    }
    const locationName = input.locationName?.trim();
    if (!locationName) throw new Error("Location name is required.");
    const contactName = input.contactName?.trim();
    if (!contactName) throw new Error("Contact name is required.");
    const address1 = input.address1?.trim();
    if (!address1) throw new Error("Address Line 1 is required.");
    const city = input.city?.trim();
    if (!city) throw new Error("City is required.");
    const state = input.state?.trim();
    if (!state) throw new Error("State is required.");
    const pin = input.pin?.trim();
    if (!pin) throw new Error("PIN / Postal Code is required.");

    let gstNumber: string | undefined;
    const gstRaw = input.gstNumber?.trim();
    if (gstRaw) {
      if (!isValidGstin(gstRaw)) throw new Error("GST number is not a valid GSTIN.");
      gstNumber = normalizeGstin(gstRaw);
    }

    return {
      customerAccessToken: input.customerAccessToken,
      companyLocationId: input.companyLocationId,
      locationName,
      contactName,
      phone: input.phone?.trim() || undefined,
      gstNumber,
      address1,
      address2: input.address2?.trim() || undefined,
      city,
      state,
      pin,
    };
  })
  .handler(async ({ data }): Promise<B2BLocationDetails> => {
    const companyLocationId = await resolveAuthorizedLocationId(data.customerAccessToken, data.companyLocationId);

    const updateResult = await adminGraphQLRequest<{
      companyLocationUpdate: { companyLocation: { id: string } | null; userErrors: Array<{ message: string }> };
    }>(LOCATION_UPDATE_MUTATION, {
      companyLocationId,
      input: { name: data.locationName, ...(data.phone ? { phone: data.phone } : {}) },
    });
    if (updateResult.errors?.length) {
      throw new Error(`Could not update location details: ${updateResult.errors.map((e) => e.message).join("; ")}`);
    }
    const updateErrors = updateResult.data?.companyLocationUpdate.userErrors ?? [];
    if (updateErrors.length) {
      throw new Error(`Could not update location details: ${updateErrors.map((e) => e.message).join("; ")}`);
    }

    const addressResult = await adminGraphQLRequest<{
      companyLocationAssignAddress: { companyAddress: { id: string } | null; userErrors: Array<{ message: string }> };
    }>(ASSIGN_ADDRESS_MUTATION, {
      locationId: companyLocationId,
      address: {
        address1: data.address1,
        ...(data.address2 ? { address2: data.address2 } : {}),
        city: data.city,
        zoneCode: data.state,
        zip: data.pin,
        countryCode: "IN",
        recipient: data.contactName,
        ...(data.phone ? { phone: data.phone } : {}),
      },
      addressTypes: ["BILLING", "SHIPPING"],
    });
    if (addressResult.errors?.length) {
      throw new Error(`Could not update your business address: ${addressResult.errors.map((e) => e.message).join("; ")}`);
    }
    const addressErrors = addressResult.data?.companyLocationAssignAddress.userErrors ?? [];
    if (addressErrors.length) {
      throw new Error(`Could not update your business address: ${addressErrors.map((e) => e.message).join("; ")}`);
    }

    if (data.gstNumber) {
      const taxResult = await adminGraphQLRequest<{
        companyLocationTaxSettingsUpdate: { companyLocation: { id: string } | null; userErrors: Array<{ message: string }> };
      }>(TAX_SETTINGS_UPDATE_MUTATION, { companyLocationId, taxRegistrationId: data.gstNumber });
      if (taxResult.errors?.length) {
        throw new Error(`Could not update GST number: ${taxResult.errors.map((e) => e.message).join("; ")}`);
      }
      const taxErrors = taxResult.data?.companyLocationTaxSettingsUpdate.userErrors ?? [];
      if (taxErrors.length) {
        throw new Error(`Could not update GST number: ${taxErrors.map((e) => e.message).join("; ")}`);
      }
    }

    const refreshed = await adminGraphQLRequest<LocationDetailsData>(LOCATION_DETAILS_QUERY, { id: companyLocationId });
    const location = refreshed.data?.companyLocation;
    if (!location) {
      // Updates above already succeeded -- a failure to re-read is never
      // worth surfacing as an overall failure.
      return {
        companyLocationId,
        companyName: "",
        locationName: data.locationName,
        gstNumber: data.gstNumber ?? null,
        contactName: data.contactName,
        phone: data.phone ?? null,
        address1: data.address1,
        address2: data.address2 ?? null,
        city: data.city,
        state: data.state,
        pin: data.pin,
        country: "India",
      };
    }
    const addr = location.billingAddress;
    return {
      companyLocationId: location.id,
      companyName: location.company.name,
      locationName: location.name,
      gstNumber: location.taxSettings?.taxRegistrationId ?? null,
      contactName: addr?.recipient ?? null,
      phone: addr?.phone ?? location.phone ?? null,
      address1: addr?.address1 ?? null,
      address2: addr?.address2 ?? null,
      city: addr?.city ?? null,
      state: addr?.zoneCode ?? null,
      pin: addr?.zip ?? null,
      country: addr?.countryCode === "IN" ? "India" : addr?.countryCode ?? null,
    };
  });
