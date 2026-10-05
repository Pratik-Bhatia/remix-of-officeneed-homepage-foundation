import { toIndiaZoneCode } from "./india-zones";
/**
 * Automatic Shopify B2B company setup, run immediately after a Company-tab
 * self-registration (src/lib/customer.ts's registerCustomer, unchanged).
 *
 * Mutation sequence -- verified live against this store's Admin API
 * 2026-10 schema before implementing, not guessed:
 *
 *   1. Resolve the REAL customerId from the token -- same trust model as
 *      resolveCustomerIdFromToken in b2b.functions.ts.
 *   2. Look up an existing Company by GST (Company.externalId). GST is
 *      the business's identifier -- two people registering with the same
 *      GST must land in the SAME Company, never a duplicate.
 *      `companies(query: "externalId:...")` returns "Invalid search
 *      field for this query" (confirmed live) -- externalId is not a
 *      supported search field -- so this paginates every company and
 *      matches client-side.
 *   3a. Found: reuse it, fully idempotently (see ensureContactAndRole
 *       below) -- never blindly re-assign a contact/role that already
 *       exists. Two partial-failure states are self-healed rather than
 *       left stuck:
 *         (A) zero usable locations (companyCreate itself never
 *             finished) -- a location is created now.
 *         (B) a location exists but has no address (companyCreate
 *             finished but a later companyLocationAssignAddress call
 *             failed) -- the address is assigned now. This is ONLY ever
 *             reached for a company whose externalId matched the
 *             submitted GST -- externalId is a field exclusively
 *             populated by this flow's own companyCreate call (confirmed
 *             live: a merchant-configured company like OfficeNeed Test
 *             Company has externalId: null, so it's never matched here),
 *             so finding one this way reliably means it's our own
 *             incomplete setup, not a third party's established
 *             business. A location that already has ANY address is
 *             never touched -- that's what "established" means here.
 *   3b. Not found: companyCreate with company{name, externalId: gst} and
 *       companyLocation{name, taxRegistrationId: gst} in ONE call.
 *       Deliberately NEVER passes `companyContact` -- CompanyContactInput
 *       has no customerId field at all, only firstName/lastName/email/
 *       phone (confirmed via introspection), so using it here would
 *       silently create a SECOND, password-less Shopify customer with
 *       the same email instead of linking the one customerCreate already
 *       made.
 *   4. The "Ordering only" role (CompanyContactRole) is resolved BY NAME
 *      from this specific company's own contactRoles every time -- never
 *      hardcoded, and never falls back to a different role (e.g.
 *      "Location admin") if it can't be found; that fails the whole
 *      setup instead (see resolveOrderingOnlyRoleId). Confirmed live
 *      that each Company gets its own distinct CompanyContactRole
 *      records (same names, different GIDs per company) -- so this must
 *      be re-resolved per company, not cached/reused across companies.
 *   5. companyAssignCustomerAsContact(companyId, customerId) -- links the
 *      EXISTING customer, never creates another. Only called if this
 *      customer isn't already a contact of this company.
 *   6. companyContactAssignRole(companyContactId, orderingOnlyRoleId,
 *      companyLocationId) -- only called if that exact role assignment
 *      (this role, this location) doesn't already exist for this
 *      contact.
 *
 * FAILURE SAFETY: any step throws immediately, naming the exact stage --
 * the caller (CustomerAuthModal.tsx / account.tsx) must never report
 * "Business account created successfully" if this throws. No automatic
 * rollback of a freshly-created Company: if a later step fails after
 * step 3b created one, it's left in place (empty, no contact -- harmless)
 * rather than risking a destructive delete on an ambiguous partial
 * state. A retry for the same GST finds and reuses it via step 2 --
 * self-healing, not an ever-growing pile of duplicates. A Company that
 * already had OTHER real contacts (the reuse path) is never deleted,
 * ever.
 */
import { createServerFn } from "@tanstack/react-start";
import { adminGraphQLRequest } from "@/lib/shopify-admin.server";
import { resolveCustomerIdFromToken } from "@/lib/b2b.functions";
import { isValidGstin, normalizeGstin } from "@/lib/gst";

export type B2BCompanySetupResult =
  | { status: "created"; companyId: string; companyLocationId: string }
  /** GST already belongs to a company this customer is not a member of.
   * Never auto-joined: GSTINs are public, so knowing one proves nothing. */
  | { status: "pending_review" };

// TEMPORARY DIAGNOSTIC: every throw point below is tagged with a safe,
// stable stage identifier -- added to pin down exactly which step of the
// automatic B2B setup is failing in production (confirmed: customer
// creation succeeds, but no Company is ever created, so the failure is
// somewhere between here and companyCreate). Never includes a token,
// secret, or Authorization header -- only Shopify's own error text, which
// never contains those. Remove once the production root cause is
// confirmed and fixed.
type AdminErrorLike = { message: string; extensions?: { code?: string } };

/** Stage-tagged error for a GraphQL-level failure (top-level `errors` or a
 * mutation's own `userErrors`) -- distinguishes an ACCESS_DENIED scope
 * failure from any other kind of GraphQL error within the same stage. */
function stageGraphQLError(stage: string, errors: Array<AdminErrorLike>, label: string): Error {
  const kind = errors.some((e) => e.extensions?.code === "ACCESS_DENIED") ? "ADMIN_GRAPHQL_ACCESS_DENIED" : "ADMIN_GRAPHQL_ERROR";
  return new Error(`[${stage}:${kind}] ${label}: ${errors.map((e) => e.message).join("; ")}`);
}

/** Stage-tagged error for a failure that isn't itself a GraphQL error list
 * (e.g. "the mutation succeeded but returned no usable result"). */
function stagePlainError(stage: string, message: string): Error {
  return new Error(`[${stage}] ${message}`);
}

const ORDERING_ONLY_ROLE_NAME = "Ordering only";

// Business address, collected on the Company registration form and stored
// directly on the Shopify Company Location -- confirmed live against this
// store's Admin API 2026-10 schema: CompanyAddressInput has no `province`/
// `country` enum like the Storefront API's MailingAddressInput does; it's
// `zoneCode` (a free-text string, e.g. "Maharashtra" -- NOT a strict ISO
// region code, confirmed via schema introspection) and `countryCode` (a
// strict CountryCode enum). GST only applies to India, so country is fixed
// to "IN" here rather than attempting a full country-name-to-ISO mapping
// this app has no other use for.
export type B2BAddressInput = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pin: string;
  country: string;
};

function toCompanyAddressInput(address: B2BAddressInput, recipient: string, phone?: string) {
  return {
    address1: address.addressLine1,
    ...(address.addressLine2 ? { address2: address.addressLine2 } : {}),
    city: address.city,
    zoneCode: address.state,
    zip: address.pin,
    countryCode: "IN",
    recipient,
    ...(phone ? { phone } : {}),
  };
}

const ASSIGN_ADDRESS_MUTATION = `
  mutation AssignCompanyLocationAddress($locationId: ID!, $address: CompanyAddressInput!, $addressTypes: [CompanyAddressType!]!) {
    companyLocationAssignAddress(locationId: $locationId, address: $address, addressTypes: $addressTypes) {
      addresses { id }
      userErrors { message field }
    }
  }
`;

/** Sets the Company Location's business address as BOTH billing and
 * shipping -- this is what makes checkout show a real address instead of
 * "(No address)" (confirmed live: a location with no address has nothing
 * for Shopify to show at checkout). Only ever called right after creating
 * a location (fresh company, or self-healing one with none) -- never
 * overwrites an existing location's address found via the GST dedup path,
 * so a second person registering under the same GST can't silently change
 * the company's real business address with their own form input. */
async function assignCompanyLocationAddress(
  companyLocationId: string,
  address: B2BAddressInput,
  recipient: string,
  phone: string | undefined,
  stage: string,
): Promise<void> {
  console.log(`[B2B setup] company address codes stage=${stage} countryCode=IN zoneCode=${address.state} addressTypes=BILLING,SHIPPING`);
  const result = await adminGraphQLRequest<{
    companyLocationAssignAddress: {
      addresses: Array<{ id: string }> | null;
      userErrors: Array<{ message: string; field: string[] | null }>;
    };
  }>(ASSIGN_ADDRESS_MUTATION, {
    locationId: companyLocationId,
    address: toCompanyAddressInput(address, recipient, phone),
    addressTypes: ["BILLING", "SHIPPING"],
  });
  if (result.errors?.length) {
    throw stageGraphQLError(stage, result.errors, "companyLocationAssignAddress failed");
  }
  const errors = result.data?.companyLocationAssignAddress.userErrors ?? [];
  if (errors.length) {
    throw stageGraphQLError(stage, errors, "companyLocationAssignAddress rejected");
  }
}

type ContactRole = { id: string; name: string };
type CompanyRef = {
  id: string;
  externalId: string | null;
  contactRoles: { edges: Array<{ node: ContactRole }> };
  locations: {
    edges: Array<{ node: { id: string; billingAddress?: { address1: string | null } | null } }>;
  };
};

/** Resolves "Ordering only" strictly by name from THIS company's own
 * contactRoles -- never hardcoded, never falls back to another role. */
function resolveOrderingOnlyRoleId(contactRoles: { edges: Array<{ node: ContactRole }> }): string {
  const role = contactRoles.edges.find((e) => e.node.name === ORDERING_ONLY_ROLE_NAME)?.node;
  if (!role) {
    throw stagePlainError(
      "ROLE_RESOLUTION_FAILED",
      `Could not resolve the "${ORDERING_ONLY_ROLE_NAME}" contact role for this company -- refusing to fall back to a different role.`,
    );
  }
  return role.id;
}

const FIND_COMPANIES_PAGE_QUERY = `
  query FindCompanies($after: String) {
    companies(first: 250, after: $after) {
      edges {
        cursor
        node {
          id
          externalId
          contactRoles(first: 50) { edges { node { id name } } }
          locations(first: 10) {
            edges {
              node {
                id
                billingAddress { address1 }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

// Sanity cap, same convention as fetchAllProducts in shopify.ts -- a
// pagination bug can never spin forever.
const MAX_COMPANY_LOOKUP_PAGES = 20;

type FindCompaniesPageData = {
  companies: { edges: Array<{ cursor: string; node: CompanyRef }>; pageInfo: { hasNextPage: boolean } };
};

async function findCompanyByExternalId(externalId: string): Promise<CompanyRef | null> {
  let after: string | null = null;
  for (let page = 0; page < MAX_COMPANY_LOOKUP_PAGES; page++) {
    const result: { data: FindCompaniesPageData | null; errors: Array<AdminErrorLike> } =
      await adminGraphQLRequest<FindCompaniesPageData>(FIND_COMPANIES_PAGE_QUERY, { after });
    if (result.errors?.length) {
      throw stageGraphQLError("GST_LOOKUP_FAILED", result.errors, "Company lookup failed");
    }
    const edges: Array<{ cursor: string; node: CompanyRef }> = result.data?.companies.edges ?? [];
    const match = edges.find((e: { cursor: string; node: CompanyRef }) => e.node.externalId === externalId);
    if (match) return match.node;
    if (!result.data?.companies.pageInfo.hasNextPage) break;
    after = edges[edges.length - 1]?.cursor ?? null;
  }
  return null;
}

const COMPANY_CREATE_MUTATION = `
  mutation CreateCompany($input: CompanyCreateInput!) {
    companyCreate(input: $input) {
      company {
        id
        externalId
        contactRoles(first: 50) { edges { node { id name } } }
        locations(first: 10) { edges { node { id } } }
      }
      userErrors { message field }
    }
  }
`;

const COMPANY_LOCATION_CREATE_MUTATION = `
  mutation CreateCompanyLocation($companyId: ID!, $input: CompanyLocationInput!) {
    companyLocationCreate(companyId: $companyId, input: $input) {
      companyLocation { id }
      userErrors { message field }
    }
  }
`;

const ASSIGN_CONTACT_MUTATION = `
  mutation AssignContact($companyId: ID!, $customerId: ID!) {
    companyAssignCustomerAsContact(companyId: $companyId, customerId: $customerId) {
      companyContact { id }
      userErrors { message field }
    }
  }
`;

const ASSIGN_ROLE_MUTATION = `
  mutation AssignRole($companyContactId: ID!, $companyContactRoleId: ID!, $companyLocationId: ID!) {
    companyContactAssignRole(
      companyContactId: $companyContactId
      companyContactRoleId: $companyContactRoleId
      companyLocationId: $companyLocationId
    ) {
      companyContactRoleAssignment { id }
      userErrors { message field }
    }
  }
`;

/** This customer's own view of whether they're already a contact of
 * `companyId`, and which role(s) they already hold at which location(s)
 * -- read from the customer side (not the company side) because it's
 * the exact same shape resolveB2BSession already trusts, and because a
 * customer can only ever be looked up by their own token-resolved id. */
const CUSTOMER_COMPANY_MEMBERSHIP_QUERY = `
  query CustomerCompanyMembership($customerId: ID!) {
    customer(id: $customerId) {
      companyContactProfiles {
        id
        company { id }
        roleAssignments(first: 50) {
          edges { node { role { id } companyLocation { id } } }
        }
      }
    }
  }
`;

type CustomerMembershipData = {
  customer: {
    companyContactProfiles: Array<{
      id: string;
      company: { id: string };
      roleAssignments: { edges: Array<{ node: { role: { id: string }; companyLocation: { id: string } } }> };
    }> | null;
  } | null;
};

async function findExistingContact(
  customerId: string,
  companyId: string,
): Promise<{ companyContactId: string; hasRoleAtLocation: (roleId: string, locationId: string) => boolean } | null> {
  const result = await adminGraphQLRequest<CustomerMembershipData>(CUSTOMER_COMPANY_MEMBERSHIP_QUERY, { customerId });
  if (result.errors?.length) {
    throw stageGraphQLError("MEMBERSHIP_LOOKUP_FAILED", result.errors, "Membership lookup failed");
  }
  const profile = (result.data?.customer?.companyContactProfiles ?? []).find((p) => p.company.id === companyId);
  if (!profile) return null;
  const assignments = profile.roleAssignments.edges;
  return {
    companyContactId: profile.id,
    hasRoleAtLocation: (roleId, locationId) =>
      assignments.some((e) => e.node.role.id === roleId && e.node.companyLocation.id === locationId),
  };
}

/** Ensures the customer is a contact of `companyId` AND holds the
 * "Ordering only" role at `companyLocationId` -- idempotently. Never
 * calls companyAssignCustomerAsContact or companyContactAssignRole when
 * the target state already exists. */
async function ensureContactAndRole(
  customerId: string,
  companyId: string,
  companyLocationId: string,
  orderingOnlyRoleId: string,
): Promise<void> {
  const existingMembership = await findExistingContact(customerId, companyId);

  let companyContactId = existingMembership?.companyContactId ?? null;
  if (!companyContactId) {
    const assignResult = await adminGraphQLRequest<{
      companyAssignCustomerAsContact: {
        companyContact: { id: string } | null;
        userErrors: Array<{ message: string; field: string[] | null }>;
      };
    }>(ASSIGN_CONTACT_MUTATION, { companyId, customerId });
    if (assignResult.errors?.length) {
      throw stageGraphQLError("ASSIGN_CONTACT_FAILED", assignResult.errors, "companyAssignCustomerAsContact failed");
    }
    const assignErrors = assignResult.data?.companyAssignCustomerAsContact.userErrors ?? [];
    if (assignErrors.length) {
      throw stageGraphQLError("ASSIGN_CONTACT_FAILED", assignErrors, "companyAssignCustomerAsContact rejected");
    }
    companyContactId = assignResult.data?.companyAssignCustomerAsContact.companyContact?.id ?? null;
    if (!companyContactId) throw stagePlainError("ASSIGN_CONTACT_FAILED", "No company contact was returned after assignment.");
  }

  const alreadyHasRole = existingMembership?.hasRoleAtLocation(orderingOnlyRoleId, companyLocationId) ?? false;
  if (!alreadyHasRole) {
    const roleResult = await adminGraphQLRequest<{
      companyContactAssignRole: {
        companyContactRoleAssignment: { id: string } | null;
        userErrors: Array<{ message: string; field: string[] | null }>;
      };
    }>(ASSIGN_ROLE_MUTATION, { companyContactId, companyContactRoleId: orderingOnlyRoleId, companyLocationId });
    if (roleResult.errors?.length) {
      throw stageGraphQLError("ASSIGN_ROLE_FAILED", roleResult.errors, "companyContactAssignRole failed");
    }
    const roleErrors = roleResult.data?.companyContactAssignRole.userErrors ?? [];
    if (roleErrors.length) {
      throw stageGraphQLError("ASSIGN_ROLE_FAILED", roleErrors, "companyContactAssignRole rejected");
    }
  }
}

export const setupB2BCompany = createServerFn({ method: "POST" })
  .inputValidator((input: {
    customerAccessToken: string;
    companyName: string;
    gstNumber: string;
    contactName: string;
    phone?: string;
    address: B2BAddressInput;
  }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing session token.");
    }
    const companyName = input.companyName?.trim();
    if (!companyName) throw new Error("Company name is required.");
    const gstNumberRaw = input.gstNumber?.trim() ?? "";
    if (!gstNumberRaw) throw new Error("GST number is required.");
    if (!isValidGstin(gstNumberRaw)) throw new Error("GST number is not a valid GSTIN.");
    const contactName = input.contactName?.trim() || companyName;
    const phone = input.phone?.trim() || undefined;

    const addressLine1 = input.address?.addressLine1?.trim() ?? "";
    const addressLine2 = input.address?.addressLine2?.trim() || undefined;
    const city = input.address?.city?.trim() ?? "";
    const stateRaw = input.address?.state?.trim() ?? "";
    const state = stateRaw ? toIndiaZoneCode(stateRaw) : "";
    if (state === null) throw new Error("Please enter a valid Indian state (e.g. Maharashtra).");
    const pin = input.address?.pin?.trim() ?? "";
    const country = input.address?.country?.trim() ?? "";
    if (!addressLine1) throw new Error("Address Line 1 is required.");
    if (!city) throw new Error("City is required.");
    if (!state) throw new Error("State is required.");
    if (!pin) throw new Error("PIN / Postal Code is required.");
    if (!country) throw new Error("Country is required.");
    // GST (the dedup key and the taxRegistrationId this address is stored
    // against) only applies to India -- see the B2BAddressInput comment
    // for why this is a fixed check rather than a general country mapping.
    if (country.trim().toLowerCase() !== "india") {
      throw new Error("Only India is currently supported for Company registration addresses.");
    }

    return {
      customerAccessToken: input.customerAccessToken,
      companyName,
      gstNumber: normalizeGstin(gstNumberRaw),
      contactName,
      ...(phone ? { phone } : {}),
      address: { addressLine1, ...(addressLine2 ? { addressLine2 } : {}), city, state, pin, country },
    };
  })
  .handler(async ({ data }): Promise<B2BCompanySetupResult> => {
    let traceCustomerId: string | null = null;
    try {
    // 1. Trusted identity -- same rule as every other B2B server function.
    const customerId = await resolveCustomerIdFromToken(data.customerAccessToken);
    if (!customerId) throw stagePlainError("CUSTOMER_RESOLUTION_FAILED", "Could not verify the signed-in customer.");
    traceCustomerId = customerId;

    // 2 / 3. Find-or-create the Company, keyed on GST.
    let companyId: string;
    let companyLocationId: string | null;
    let orderingOnlyRoleId: string;

    const existing = await findCompanyByExternalId(data.gstNumber);
    if (existing) {
      // SECURITY: a GST match alone must never add someone to an existing
      // company (GSTINs are public -- printed on invoices, searchable on
      // the GST portal). Only a customer who is ALREADY a contact of this
      // company may continue (retry/self-heal of their own setup);
      // everyone else is recorded for manual OfficeNeed review instead.
      const membership = await findExistingContact(customerId, existing.id);
      if (!membership) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("business_account_requests")
            .upsert(
              { shopify_customer_id: customerId, company_name: data.companyName, gst_number: data.gstNumber },
              { onConflict: "shopify_customer_id" },
            );
        } catch (e) {
          console.error("[B2B setup] Failed to record pending review request:", e);
        }
        console.warn(`[B2B setup] branch=existing-pending customer=${customerId} gst=${data.gstNumber} company=${existing.id}`);
        return { status: "pending_review" };
      }
      console.log(`[B2B setup] branch=existing-member customer=${customerId} gst=${data.gstNumber} company=${existing.id}`);
      companyId = existing.id;
      orderingOnlyRoleId = resolveOrderingOnlyRoleId(existing.contactRoles);
      const existingLocation = existing.locations.edges[0]?.node ?? null;
      companyLocationId = existingLocation?.id ?? null;

      // Self-heal case A: the company exists but has zero usable
      // locations at all (e.g. left over from a prior partial failure
      // that created the Company but never its Location).
      if (!companyLocationId) {
        const locationResult = await adminGraphQLRequest<{
          companyLocationCreate: {
            companyLocation: { id: string } | null;
            userErrors: Array<{ message: string; field: string[] | null }>;
          };
        }>(COMPANY_LOCATION_CREATE_MUTATION, {
          companyId,
          input: {
            name: `${data.companyName} - Head Office`,
            taxRegistrationId: data.gstNumber,
            buyerExperienceConfiguration: { editableShippingAddress: false },
          },
        });
        if (locationResult.errors?.length) {
          throw stageGraphQLError("COMPANY_LOCATION_CREATE_FAILED", locationResult.errors, "companyLocationCreate failed");
        }
        const locationErrors = locationResult.data?.companyLocationCreate.userErrors ?? [];
        if (locationErrors.length) {
          throw stageGraphQLError("COMPANY_LOCATION_CREATE_FAILED", locationErrors, "companyLocationCreate rejected");
        }
        companyLocationId = locationResult.data?.companyLocationCreate.companyLocation?.id ?? null;
        if (!companyLocationId) {
          throw stagePlainError("COMPANY_LOCATION_CREATE_FAILED", "companyLocationCreate did not return a usable location.");
        }
        // Freshly created (self-heal path) -- no existing address to
        // protect, so always assign the one just collected.
        await assignCompanyLocationAddress(companyLocationId, data.address, data.contactName, data.phone, "COMPANY_LOCATION_CREATE_FAILED");
      } else if (!existingLocation?.billingAddress?.address1) {
        // Self-heal case B: the location exists but has no address --
        // exactly the state left behind by companyCreate succeeding and a
        // later companyLocationAssignAddress call failing (confirmed this
        // is possible: nothing currently retries that step). Only ever
        // reached for a company whose externalId matched this submitted
        // GST -- externalId is a field ONLY this flow's companyCreate
        // ever populates (confirmed live: the merchant's own manually
        // configured OfficeNeed Test Company has externalId: null, so it
        // can never be matched or reached here), so a company found this
        // way is reliably one this automated flow itself created. A
        // location that already HAS any address is never touched by this
        // branch -- that's the actual "don't overwrite an established
        // business address" guard: an established location, by
        // definition, already has one.
        await assignCompanyLocationAddress(companyLocationId, data.address, data.contactName, data.phone, "COMPANY_LOCATION_CREATE_FAILED");
      }
    } else {
      console.log(`[B2B setup] branch=create customer=${customerId} gst=${data.gstNumber}`);
      const createResult = await adminGraphQLRequest<{
        companyCreate: { company: CompanyRef | null; userErrors: Array<{ message: string; field: string[] | null }> };
      }>(COMPANY_CREATE_MUTATION, {
        input: {
          company: { name: data.companyName, externalId: data.gstNumber },
          companyLocation: {
            name: `${data.companyName} - Head Office`,
            taxRegistrationId: data.gstNumber,
            buyerExperienceConfiguration: { editableShippingAddress: false },
          },
        },
      });
      if (createResult.errors?.length) {
        throw stageGraphQLError("COMPANY_CREATE_FAILED", createResult.errors, "companyCreate failed");
      }
      const userErrors = createResult.data?.companyCreate.userErrors ?? [];
      if (userErrors.length) {
        throw stageGraphQLError("COMPANY_CREATE_FAILED", userErrors, "companyCreate rejected");
      }
      const company = createResult.data?.companyCreate.company;
      if (!company) throw stagePlainError("COMPANY_CREATE_FAILED", "companyCreate returned no company.");
      companyId = company.id;
      orderingOnlyRoleId = resolveOrderingOnlyRoleId(company.contactRoles);
      companyLocationId = company.locations.edges[0]?.node.id ?? null;
      if (!companyLocationId) throw stagePlainError("COMPANY_CREATE_FAILED", "companyCreate did not create a usable location.");
      // Brand-new company/location -- always assign the address collected
      // on the registration form.
      await assignCompanyLocationAddress(companyLocationId, data.address, data.contactName, data.phone, "COMPANY_CREATE_FAILED");
    }

    // 4/5/6, fully idempotent -- see ensureContactAndRole's doc comment.
    await ensureContactAndRole(customerId, companyId, companyLocationId, orderingOnlyRoleId);

    console.log(`[B2B setup] SUCCESS customer=${customerId} gst=${data.gstNumber} company=${companyId}`);
    return { status: "created", companyId, companyLocationId };
    } catch (err) {
      // Server-side trace of the exact failing stage. Never logs tokens.
      const msg = err instanceof Error ? err.message : String(err);
      const stage = /^\[([A-Z_:,]+)\]/.exec(msg)?.[1] ?? "UNTAGGED";
      console.error(`[B2B setup] FAILED stage=${stage} customer=${traceCustomerId ?? "unresolved"} gst=${data.gstNumber} msg=${msg}`);
      throw err;
    }
  });
