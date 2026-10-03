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
 *       exists, and self-heal a company left with zero usable locations
 *       (e.g. from a prior partial failure) by creating one rather than
 *       failing outright.
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

export type B2BCompanySetupResult = { companyId: string; companyLocationId: string };

const ORDERING_ONLY_ROLE_NAME = "Ordering only";

type ContactRole = { id: string; name: string };
type CompanyRef = {
  id: string;
  externalId: string | null;
  contactRoles: { edges: Array<{ node: ContactRole }> };
  locations: { edges: Array<{ node: { id: string } }> };
};

/** Resolves "Ordering only" strictly by name from THIS company's own
 * contactRoles -- never hardcoded, never falls back to another role. */
function resolveOrderingOnlyRoleId(contactRoles: { edges: Array<{ node: ContactRole }> }): string {
  const role = contactRoles.edges.find((e) => e.node.name === ORDERING_ONLY_ROLE_NAME)?.node;
  if (!role) {
    throw new Error(
      `[B2B setup] Could not resolve the "${ORDERING_ONLY_ROLE_NAME}" contact role for this company -- refusing to fall back to a different role.`,
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
          locations(first: 10) { edges { node { id } } }
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
    const result: { data: FindCompaniesPageData | null; errors: Array<{ message: string }> } =
      await adminGraphQLRequest<FindCompaniesPageData>(FIND_COMPANIES_PAGE_QUERY, { after });
    if (result.errors?.length) {
      throw new Error(`[B2B setup] Company lookup failed: ${result.errors.map((e: { message: string }) => e.message).join("; ")}`);
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
    throw new Error(`[B2B setup] Membership lookup failed: ${result.errors.map((e) => e.message).join("; ")}`);
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
      throw new Error(
        `[B2B setup] companyAssignCustomerAsContact failed: ${assignResult.errors.map((e) => e.message).join("; ")}`,
      );
    }
    const assignErrors = assignResult.data?.companyAssignCustomerAsContact.userErrors ?? [];
    if (assignErrors.length) {
      throw new Error(
        `[B2B setup] companyAssignCustomerAsContact rejected: ${assignErrors.map((e) => e.message).join("; ")}`,
      );
    }
    companyContactId = assignResult.data?.companyAssignCustomerAsContact.companyContact?.id ?? null;
    if (!companyContactId) throw new Error("[B2B setup] No company contact was returned after assignment.");
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
      throw new Error(`[B2B setup] companyContactAssignRole failed: ${roleResult.errors.map((e) => e.message).join("; ")}`);
    }
    const roleErrors = roleResult.data?.companyContactAssignRole.userErrors ?? [];
    if (roleErrors.length) {
      throw new Error(`[B2B setup] companyContactAssignRole rejected: ${roleErrors.map((e) => e.message).join("; ")}`);
    }
  }
}

export const setupB2BCompany = createServerFn({ method: "POST" })
  .inputValidator((input: { customerAccessToken: string; companyName: string; gstNumber: string }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing session token.");
    }
    const companyName = input.companyName?.trim();
    if (!companyName) throw new Error("Company name is required.");
    const gstNumberRaw = input.gstNumber?.trim() ?? "";
    if (!gstNumberRaw) throw new Error("GST number is required.");
    if (!isValidGstin(gstNumberRaw)) throw new Error("GST number is not a valid GSTIN.");
    return { customerAccessToken: input.customerAccessToken, companyName, gstNumber: normalizeGstin(gstNumberRaw) };
  })
  .handler(async ({ data }): Promise<B2BCompanySetupResult> => {
    // 1. Trusted identity -- same rule as every other B2B server function.
    const customerId = await resolveCustomerIdFromToken(data.customerAccessToken);
    if (!customerId) throw new Error("[B2B setup] Could not verify the signed-in customer.");

    // 2 / 3. Find-or-create the Company, keyed on GST.
    let companyId: string;
    let companyLocationId: string | null;
    let orderingOnlyRoleId: string;

    const existing = await findCompanyByExternalId(data.gstNumber);
    if (existing) {
      companyId = existing.id;
      orderingOnlyRoleId = resolveOrderingOnlyRoleId(existing.contactRoles);
      companyLocationId = existing.locations.edges[0]?.node.id ?? null;

      // Self-heal rather than fail: a company can legitimately have zero
      // usable locations (e.g. left over from a prior partial failure
      // that created the Company but never its Location). Ensure one
      // exists instead of blindly trusting -- or blindly rejecting --
      // whatever locations() happened to return.
      if (!companyLocationId) {
        const locationResult = await adminGraphQLRequest<{
          companyLocationCreate: {
            companyLocation: { id: string } | null;
            userErrors: Array<{ message: string; field: string[] | null }>;
          };
        }>(COMPANY_LOCATION_CREATE_MUTATION, {
          companyId,
          input: { name: `${data.companyName} - Head Office`, taxRegistrationId: data.gstNumber },
        });
        if (locationResult.errors?.length) {
          throw new Error(`[B2B setup] companyLocationCreate failed: ${locationResult.errors.map((e) => e.message).join("; ")}`);
        }
        const locationErrors = locationResult.data?.companyLocationCreate.userErrors ?? [];
        if (locationErrors.length) {
          throw new Error(`[B2B setup] companyLocationCreate rejected: ${locationErrors.map((e) => e.message).join("; ")}`);
        }
        companyLocationId = locationResult.data?.companyLocationCreate.companyLocation?.id ?? null;
        if (!companyLocationId) throw new Error("[B2B setup] companyLocationCreate did not return a usable location.");
      }
    } else {
      const createResult = await adminGraphQLRequest<{
        companyCreate: { company: CompanyRef | null; userErrors: Array<{ message: string; field: string[] | null }> };
      }>(COMPANY_CREATE_MUTATION, {
        input: {
          company: { name: data.companyName, externalId: data.gstNumber },
          companyLocation: { name: `${data.companyName} - Head Office`, taxRegistrationId: data.gstNumber },
        },
      });
      if (createResult.errors?.length) {
        throw new Error(`[B2B setup] companyCreate failed: ${createResult.errors.map((e) => e.message).join("; ")}`);
      }
      const userErrors = createResult.data?.companyCreate.userErrors ?? [];
      if (userErrors.length) {
        throw new Error(`[B2B setup] companyCreate rejected: ${userErrors.map((e) => e.message).join("; ")}`);
      }
      const company = createResult.data?.companyCreate.company;
      if (!company) throw new Error("[B2B setup] companyCreate returned no company.");
      companyId = company.id;
      orderingOnlyRoleId = resolveOrderingOnlyRoleId(company.contactRoles);
      companyLocationId = company.locations.edges[0]?.node.id ?? null;
      if (!companyLocationId) throw new Error("[B2B setup] companyCreate did not create a usable location.");
    }

    // 4/5/6, fully idempotent -- see ensureContactAndRole's doc comment.
    await ensureContactAndRole(customerId, companyId, companyLocationId, orderingOnlyRoleId);

    return { companyId, companyLocationId };
  });
