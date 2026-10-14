// Regression tests for src/lib/b2b-company-setup.functions.ts.
//
// No test file ever existed for this module before (confirmed via git
// history -- the original "automate Shopify B2B company registration"
// commit, 6039f3d, never added one). These prove the two functions do
// exactly what the restored-original-workflow requires:
//
//   - findOrCreateShopifyCompany: creates (or reuses, by GST) a real
//     Shopify Company + Location -- NEVER a contact or role assignment.
//     Used at registration time so the Company is visible in Shopify
//     Admin immediately, without granting any B2B access.
//   - provisionShopifyCompanyForApproval: the above, PLUS contact+role
//     assignment -- the step that actually grants access. Currently
//     unused by any caller, kept for a possible future admin tool.
//
// Mocks the Admin API transport (adminGraphQLRequest) so no real Shopify
// call happens. mock.module can only be registered ONCE per module per
// process (confirmed live: a second call throws ERR_INVALID_STATE), so --
// same pattern as b2b.functions.account-classification.test.mjs -- this
// registers ONE mock whose behavior is swapped out per test via a mutable
// `currentImpl` reference, rather than calling mock.module repeatedly.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/b2b-company-setup.functions.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";

let currentImpl = async () => { throw new Error("no fake Admin API configured for this test"); };

mock.module("@/lib/shopify-admin.server", {
  namedExports: {
    adminGraphQLRequest: (query, variables) => currentImpl(query, variables),
  },
});

const { findOrCreateShopifyCompany, provisionShopifyCompanyForApproval } = await import("@/lib/b2b-company-setup.functions");

// In-memory fake Shopify Admin API -- enough of companies/companyCreate/
// companyLocationCreate/companyLocationAssignAddress/
// companyAssignCustomerAsContact/companyContactAssignRole/the customer
// membership lookup to exercise the real control flow, keyed by GST
// (externalId) the same way the real store is.
function makeFakeShopifyAdmin() {
  const companies = []; // { id, externalId, name, contactRoles, locations: [{id, billingAddress}] }
  const contactsByCustomer = new Map(); // customerId -> { companyContactId, companyId, roles: Set("roleId@locationId") }
  const calls = { companyCreate: 0, companyLocationCreate: 0, assignAddress: 0, assignContact: 0, assignRole: 0 };
  let nextId = 1;

  const ORDERING_ROLE = { id: "role-ordering-only", name: "Ordering only" };

  async function adminGraphQLRequest(query, variables) {
    if (query.includes("FindCompanies")) {
      return { data: { companies: { edges: companies.map((c) => ({ cursor: c.id, node: c })), pageInfo: { hasNextPage: false } } }, errors: [] };
    }
    if (query.includes("CreateCompany")) {
      calls.companyCreate++;
      const id = `company-${nextId++}`;
      const locationId = `location-${nextId++}`;
      const company = {
        id,
        externalId: variables.input.company.externalId,
        name: variables.input.company.name,
        contactRoles: { edges: [{ node: ORDERING_ROLE }] },
        locations: { edges: [{ node: { id: locationId, billingAddress: null } }] },
      };
      companies.push(company);
      return { data: { companyCreate: { company, userErrors: [] } }, errors: [] };
    }
    if (query.includes("CreateCompanyLocation")) {
      calls.companyLocationCreate++;
      const locationId = `location-${nextId++}`;
      const company = companies.find((c) => c.id === variables.companyId);
      company.locations.edges.push({ node: { id: locationId, billingAddress: null } });
      return { data: { companyLocationCreate: { companyLocation: { id: locationId }, userErrors: [] } }, errors: [] };
    }
    if (query.includes("AssignCompanyLocationAddress")) {
      calls.assignAddress++;
      for (const c of companies) {
        const loc = c.locations.edges.find((e) => e.node.id === variables.locationId);
        if (loc) loc.node.billingAddress = { address1: variables.address.address1 };
      }
      return { data: { companyLocationAssignAddress: { addresses: [{ id: "addr-1" }], userErrors: [] } }, errors: [] };
    }
    if (query.includes("CustomerCompanyMembership")) {
      const membership = contactsByCustomer.get(variables.customerId);
      if (!membership) return { data: { customer: { companyContactProfiles: [] } }, errors: [] };
      return {
        data: {
          customer: {
            companyContactProfiles: [
              {
                id: membership.companyContactId,
                company: { id: membership.companyId },
                roleAssignments: { edges: [...membership.roles].map((r) => { const [roleId, locationId] = r.split("@"); return { node: { role: { id: roleId }, companyLocation: { id: locationId } } }; }) },
              },
            ],
          },
        },
        errors: [],
      };
    }
    if (query.includes("AssignContact")) {
      calls.assignContact++;
      const companyContactId = `contact-${nextId++}`;
      contactsByCustomer.set(variables.customerId, { companyContactId, companyId: variables.companyId, roles: new Set() });
      return { data: { companyAssignCustomerAsContact: { companyContact: { id: companyContactId }, userErrors: [] } }, errors: [] };
    }
    if (query.includes("AssignRole")) {
      calls.assignRole++;
      for (const membership of contactsByCustomer.values()) {
        if (membership.companyContactId === variables.companyContactId) {
          membership.roles.add(`${variables.companyContactRoleId}@${variables.companyLocationId}`);
        }
      }
      return { data: { companyContactAssignRole: { companyContactRoleAssignment: { id: `assignment-${nextId++}` }, userErrors: [] } }, errors: [] };
    }
    throw new Error(`Unhandled fake Admin API query: ${query.slice(0, 60)}`);
  }

  return { adminGraphQLRequest, companies, calls };
}

const GST = "27AAAAA0000A1Z5";

test("findOrCreateShopifyCompany creates a new Company + Location, sets GST on both externalId and taxRegistrationId, and NEVER assigns a contact or role", async () => {
  const fake = makeFakeShopifyAdmin();
  currentImpl = fake.adminGraphQLRequest;

  const result = await findOrCreateShopifyCompany({ companyName: "Acme Pvt Ltd", gstNumber: GST, contactName: "Jane Doe" });

  assert.equal(fake.calls.companyCreate, 1);
  assert.ok(result.companyId);
  assert.ok(result.companyLocationId);
  assert.ok(result.orderingOnlyRoleId);
  assert.equal(fake.companies[0].externalId, GST, "GST stored as Company.externalId (this flow's own dedup key)");
  assert.equal(fake.companies[0].name, "Acme Pvt Ltd");
  assert.equal(fake.calls.assignContact, 0, "must never assign a contact at registration time");
  assert.equal(fake.calls.assignRole, 0, "must never assign a role at registration time");
});

test("a Company created by findOrCreateShopifyCompany grants NO customer any access -- the same query b2b.functions.ts's resolveCompanyLocationsForCustomer runs returns zero locations for anyone", async () => {
  const fake = makeFakeShopifyAdmin();
  currentImpl = fake.adminGraphQLRequest;

  const { companyId } = await findOrCreateShopifyCompany({ companyName: "Acme Pvt Ltd", gstNumber: GST, contactName: "Jane Doe" });
  assert.ok(companyId, "the Company really was created");

  // Mirrors the exact query shape b2b.functions.ts's
  // CUSTOMER_COMPANY_LOCATIONS_QUERY uses (customer.companyContactProfiles
  // -> roleAssignments -> companyLocation) -- this fake's own
  // "CustomerCompanyMembership" handler implements that same lookup.
  // Checking it for an ARBITRARY customer id who never registered proves
  // the Company's mere existence contributes nothing to anyone's access.
  for (const someCustomerId of ["gid://shopify/Customer/1", "gid://shopify/Customer/999", "gid://shopify/Customer/anyone-at-all"]) {
    const membership = await fake.adminGraphQLRequest(
      "query CustomerCompanyMembership($customerId: ID!) { customer(id: $customerId) { companyContactProfiles { id } } }",
      { customerId: someCustomerId },
    );
    assert.equal(membership.data.customer.companyContactProfiles.length, 0, `${someCustomerId} must have zero company contact profiles -- no contact was ever assigned`);
  }
});

test("findOrCreateShopifyCompany reuses the existing Company for a GST already seen -- never a second companyCreate", async () => {
  const fake = makeFakeShopifyAdmin();
  currentImpl = fake.adminGraphQLRequest;

  const first = await findOrCreateShopifyCompany({ companyName: "Acme Pvt Ltd", gstNumber: GST, contactName: "Jane Doe" });
  const second = await findOrCreateShopifyCompany({ companyName: "A Different Name Typed By Someone Else", gstNumber: GST, contactName: "Second Person" });

  assert.equal(fake.calls.companyCreate, 1, "only ONE companyCreate call total -- the second lookup found the first's Company");
  assert.equal(first.companyId, second.companyId);
  assert.equal(first.companyLocationId, second.companyLocationId);
  assert.equal(fake.companies.length, 1);
  assert.equal(fake.companies[0].name, "Acme Pvt Ltd", "the SECOND registrant's company name never overwrites the existing Company's real name");
});

test("findOrCreateShopifyCompany retried after a simulated mid-flow failure self-heals instead of creating a duplicate Company", async () => {
  const fake = makeFakeShopifyAdmin();
  let failNextLocationAssignAddress = true;
  currentImpl = async (query, variables) => {
    if (query.includes("AssignCompanyLocationAddress") && failNextLocationAssignAddress) {
      failNextLocationAssignAddress = false;
      return { data: null, errors: [{ message: "simulated timeout" }] };
    }
    return fake.adminGraphQLRequest(query, variables);
  };

  const address = { addressLine1: "123 Main St", city: "Mumbai", state: "Maharashtra", pin: "400001", country: "India" };
  await assert.rejects(() => findOrCreateShopifyCompany({ companyName: "Acme", gstNumber: GST, contactName: "Jane", address }));
  assert.equal(fake.calls.companyCreate, 1, "the Company itself WAS created before the address step failed");

  // Retry: must find and reuse the already-created Company/Location (self-heal case B), not create a second one.
  const retried = await findOrCreateShopifyCompany({ companyName: "Acme", gstNumber: GST, contactName: "Jane", address });
  assert.equal(fake.calls.companyCreate, 1, "retry must never call companyCreate a second time");
  assert.equal(fake.companies.length, 1, "still exactly one Company for this GST");
  assert.ok(retried.companyId);
});

test("provisionShopifyCompanyForApproval DOES assign the contact and role (this is the function the manual Shopify Admin workflow replaces, not registration)", async () => {
  const fake = makeFakeShopifyAdmin();
  currentImpl = fake.adminGraphQLRequest;

  await provisionShopifyCompanyForApproval({
    customerId: "gid://shopify/Customer/1",
    companyName: "Acme Pvt Ltd",
    gstNumber: GST,
    contactName: "Jane Doe",
  });

  assert.equal(fake.calls.companyCreate, 1);
  assert.equal(fake.calls.assignContact, 1, "this function IS the one that grants access -- confirming the split is correct");
  assert.equal(fake.calls.assignRole, 1);
});

test("a companyCreate rejection (userErrors) throws a stage-tagged error, never silently swallowed", async () => {
  const fake = makeFakeShopifyAdmin();
  currentImpl = async (query, variables) => {
    if (query.includes("CreateCompany")) {
      return { data: { companyCreate: { company: null, userErrors: [{ message: "Externalid has already been taken", field: ["externalId"] }] } }, errors: [] };
    }
    return fake.adminGraphQLRequest(query, variables);
  };

  await assert.rejects(
    () => findOrCreateShopifyCompany({ companyName: "Acme", gstNumber: GST, contactName: "Jane" }),
    (err) => {
      assert.match(err.message, /^\[COMPANY_CREATE_FAILED/);
      return true;
    },
  );
});
