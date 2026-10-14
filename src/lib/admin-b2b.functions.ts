/**
 * Admin-only B2B company approval + payment-terms management.
 *
 * Same auth pattern as src/lib/admin-quotes.functions.ts: requireSupabaseAuth
 * (validates a Supabase bearer JWT) + assertAdmin (checks public.user_roles
 * for role='admin'). Every mutation here is the ONLY place that's allowed
 * to call provisionShopifyCompanyForApproval
 * (src/lib/b2b-company-setup.functions.ts) -- a pending or rejected
 * application can never reach that function through any customer-facing
 * path, because no customer-facing path calls it at all anymore.
 *
 * Each createServerFn below is a thin shim over a plain, directly
 * unit-testable `*Impl` function -- same pattern as
 * src/lib/buy-now-customization.functions.ts's saveBuyNowCustomizationRecord
 * and src/lib/shopify-order-webhook.server.ts, needed because a
 * createServerFn's own handler can't be invoked outside the real
 * TanStack Start server runtime in node:test.
 *
 * `supabase`/`client` calls against b2b_companies and
 * business_account_requests' new columns are cast to `any` throughout --
 * both were added in 20261014140000_restore_b2b_manual_approval.sql, not
 * yet reflected in the generated Database type (same convention
 * admin-quotes.functions.ts already uses for a table it queries ahead of
 * a type regen).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminGraphQLRequest } from "@/lib/shopify-admin.server";
import { provisionShopifyCompanyForApproval } from "@/lib/b2b-company-setup.functions";
import { resolveCompanyLocationsForCustomer } from "@/lib/b2b.functions";

/**
 * Shopify Admin is the ONLY authority for B2B approval. The website never
 * creates Shopify companies/contacts/roles or sets payment terms anymore --
 * the admin does that in Shopify Admin. Flip to true only to roll back to
 * the old website-driven approval (provisioning code kept intact).
 */
export const WEBSITE_B2B_APPROVAL_ENABLED = false;

/**
 * Reads the customer's REAL Shopify company/contact/role link and mirrors
 * it onto our application record as a display label. The label is never
 * used for access -- b2b.functions.ts decides access from Shopify alone.
 */
export async function checkShopifyApprovalImpl(
  data: { requestId: string },
  context: AdminContext,
  deps: { resolveLocations: typeof resolveCompanyLocationsForCustomer } = { resolveLocations: resolveCompanyLocationsForCustomer },
) {
  await assertAdmin(context);
  const client = context.supabase;
  const { data: request, error } = await client
    .from("business_account_requests")
    .select("id, status, shopify_customer_id")
    .eq("id", data.requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!request) throw new Error("Application not found.");
  const locations = await deps.resolveLocations(request.shopify_customer_id);
  const linked = locations.length > 0;
  if (linked && request.status !== "approved") {
    const { error: updErr } = await client
      .from("business_account_requests")
      .update({ status: "approved", reviewed_by: context.userId, reviewed_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", data.requestId);
    if (updErr) throw new Error(updErr.message);
  }
  return { linked, locations };
}

export const checkShopifyApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string }) => {
    if (!input?.requestId) throw new Error("requestId is required.");
    return { requestId: input.requestId };
  })
  .handler(async ({ data, context }) => checkShopifyApprovalImpl(data, context as any));

const APPROVAL_IN_SHOPIFY_MESSAGE = "B2B approval and payment terms are managed in Shopify Admin.";

type AdminContext = { supabase: any; userId: string };

export async function assertAdmin(context: AdminContext) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Unable to verify admin access");
  if (!data) throw new Error("Forbidden: admin access required");
}

export async function listB2BApplicationsImpl(data: { status?: "pending" | "approved" | "rejected" }, context: AdminContext) {
  await assertAdmin(context);
  let query = context.supabase
    .from("business_account_requests")
    .select("*, b2b_companies(id, company_name, gst_number, payment_terms, payment_terms_template_name)")
    .order("created_at", { ascending: false });
  if (data.status) query = query.eq("status", data.status);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  return (rows ?? []) as any[];
}

export const listB2BApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: "pending" | "approved" | "rejected" } | undefined) => input ?? {})
  .handler(async ({ data, context }) => listB2BApplicationsImpl(data, context as any));

const PAYMENT_TERMS_TEMPLATES_QUERY = `
  query ListPaymentTermsTemplates {
    paymentTermsTemplates {
      id
      name
      paymentTermsType
      dueInDays
      translatedName
    }
  }
`;

export type PaymentTermsTemplateOption = {
  id: string;
  name: string;
  paymentTermsType: string;
  dueInDays: number | null;
  translatedName: string;
};

export async function listPaymentTermsTemplatesImpl(context: AdminContext): Promise<PaymentTermsTemplateOption[]> {
  await assertAdmin(context);
  const result = await adminGraphQLRequest<{ paymentTermsTemplates: PaymentTermsTemplateOption[] }>(PAYMENT_TERMS_TEMPLATES_QUERY);
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join("; "));
  return result.data?.paymentTermsTemplates ?? [];
}

/** Always sourced live from Shopify, never hardcoded -- confirmed live
 * against this store's Admin API 2026-10 schema before building this
 * (see the plan this feature shipped from): this query works on the
 * store's current Basic plan with no extra configuration. */
export const listPaymentTermsTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listPaymentTermsTemplatesImpl(context as any));

const COMPANY_LOCATION_UPDATE_MUTATION = `
  mutation UpdateCompanyLocationPaymentTerms($companyLocationId: ID!, $input: CompanyLocationUpdateInput!) {
    companyLocationUpdate(companyLocationId: $companyLocationId, input: $input) {
      companyLocation { id }
      userErrors { message field }
    }
  }
`;

/** Applies (or clears) the Company Location's standing payment-terms
 * template -- the native Shopify mechanism that makes every order from
 * this company location defer payment to the template's due date instead
 * of collecting at checkout (confirmed live; see this feature's plan for
 * the introspection that proved this field exists and works on this
 * store's plan). `pay_now` clears it (null) so checkout collects payment
 * normally, same as every company before this feature existed. */
export async function applyPaymentTermsToShopify(companyLocationId: string, paymentTermsTemplateId: string | null): Promise<void> {
  const result = await adminGraphQLRequest<{
    companyLocationUpdate: { companyLocation: { id: string } | null; userErrors: Array<{ message: string; field: string[] | null }> };
  }>(COMPANY_LOCATION_UPDATE_MUTATION, {
    companyLocationId,
    input: { buyerExperienceConfiguration: { paymentTermsTemplateId } },
  });
  if (result.errors?.length) throw new Error(`companyLocationUpdate failed: ${result.errors.map((e) => e.message).join("; ")}`);
  const errors = result.data?.companyLocationUpdate.userErrors ?? [];
  if (errors.length) throw new Error(`companyLocationUpdate rejected: ${errors.map((e) => e.message).join("; ")}`);
}

export function validatePaymentTermsChoice(paymentTerms: unknown, paymentTermsTemplateId: unknown) {
  if (paymentTerms !== "pay_now" && paymentTerms !== "pay_later") {
    throw new Error("paymentTerms must be 'pay_now' or 'pay_later'.");
  }
  if (paymentTerms === "pay_later" && (!paymentTermsTemplateId || typeof paymentTermsTemplateId !== "string")) {
    throw new Error("A payment terms template is required for Pay Later.");
  }
  return {
    paymentTerms: paymentTerms as "pay_now" | "pay_later",
    paymentTermsTemplateId: paymentTerms === "pay_later" ? (paymentTermsTemplateId as string) : null,
  };
}

export type ApproveB2BApplicationInput = {
  requestId: string;
  paymentTerms: "pay_now" | "pay_later";
  paymentTermsTemplateId: string | null;
  paymentTermsTemplateName: string | null;
};

/**
 * The actual approval logic -- also directly exercised by
 * provisionShopifyCompanyForApproval's own call, injected here so tests
 * can swap it for a fake without touching the real Shopify Admin API.
 */
export async function approveB2BApplicationImpl(
  data: ApproveB2BApplicationInput,
  context: AdminContext,
  deps: { provision: typeof provisionShopifyCompanyForApproval; applyTerms: typeof applyPaymentTermsToShopify } = {
    provision: provisionShopifyCompanyForApproval,
    applyTerms: applyPaymentTermsToShopify,
  },
) {
  await assertAdmin(context);
  const client = context.supabase;

  const { data: request, error: loadError } = await client
    .from("business_account_requests")
    .select("*")
    .eq("id", data.requestId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!request) throw new Error("Application not found.");
  if (request.status === "approved") return { ok: true, companyId: request.b2b_company_id };

  // Provisioning is idempotent and self-healing (see
  // provisionShopifyCompanyForApproval's own doc comment) -- always call
  // it rather than branching on whether a b2b_companies row already
  // exists, so a retried/duplicate approval can never create a second
  // Shopify Company for the same GST.
  const hasStoredAddress = request.address_line1 && request.city && request.state && request.pin && request.country;
  const provisioned = await deps.provision({
    customerId: request.shopify_customer_id,
    companyName: request.company_name,
    gstNumber: request.gst_number,
    contactName: request.contact_name || request.company_name,
    ...(request.phone ? { phone: request.phone } : {}),
    ...(hasStoredAddress
      ? {
          address: {
            addressLine1: request.address_line1,
            ...(request.address_line2 ? { addressLine2: request.address_line2 } : {}),
            city: request.city,
            state: request.state,
            pin: request.pin,
            country: request.country,
          },
        }
      : {}),
  });

  await deps.applyTerms(provisioned.companyLocationId, data.paymentTermsTemplateId);

  const { data: existingCompany, error: companyLookupError } = await client
    .from("b2b_companies")
    .select("id")
    .eq("gst_number", request.gst_number)
    .maybeSingle();
  if (companyLookupError) throw new Error(companyLookupError.message);

  let companyRowId = existingCompany?.id ?? null;
  if (!companyRowId) {
    const { data: inserted, error: insertError } = await client
      .from("b2b_companies")
      .insert({
        gst_number: request.gst_number,
        company_name: request.company_name,
        shopify_company_id: provisioned.companyId,
        shopify_company_location_id: provisioned.companyLocationId,
        payment_terms: data.paymentTerms,
        payment_terms_template_id: data.paymentTermsTemplateId,
        payment_terms_template_name: data.paymentTermsTemplateName,
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    companyRowId = inserted.id;
  } else {
    const { error: updateCompanyError } = await client
      .from("b2b_companies")
      .update({
        payment_terms: data.paymentTerms,
        payment_terms_template_id: data.paymentTermsTemplateId,
        payment_terms_template_name: data.paymentTermsTemplateName,
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", companyRowId);
    if (updateCompanyError) throw new Error(updateCompanyError.message);
  }

  const { error: updateRequestError } = await client
    .from("business_account_requests")
    .update({ status: "approved", b2b_company_id: companyRowId, reviewed_by: context.userId, reviewed_at: new Date().toISOString(), rejection_reason: null })
    .eq("id", data.requestId);
  if (updateRequestError) throw new Error(updateRequestError.message);

  return { ok: true, companyId: companyRowId };
}

export const approveB2BApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string; paymentTerms: "pay_now" | "pay_later"; paymentTermsTemplateId?: string; paymentTermsTemplateName?: string }) => {
    if (!input?.requestId) throw new Error("requestId is required.");
    const { paymentTerms, paymentTermsTemplateId } = validatePaymentTermsChoice(input.paymentTerms, input.paymentTermsTemplateId);
    return {
      requestId: input.requestId,
      paymentTerms,
      paymentTermsTemplateId,
      paymentTermsTemplateName: paymentTerms === "pay_later" ? (input.paymentTermsTemplateName?.trim() || null) : null,
    };
  })
  .handler(async ({ data, context }) => {
    if (!WEBSITE_B2B_APPROVAL_ENABLED) throw new Error(APPROVAL_IN_SHOPIFY_MESSAGE);
    return approveB2BApplicationImpl(data, context as any);
  });

export async function rejectB2BApplicationImpl(data: { requestId: string; reason: string | null }, context: AdminContext) {
  await assertAdmin(context);
  // Supabase-only -- no Shopify mutation at all, by design: a rejected
  // application must never have had any Shopify Company/Contact/Role
  // relationship created for it.
  const { error } = await context.supabase
    .from("business_account_requests")
    .update({ status: "rejected", reviewed_by: context.userId, reviewed_at: new Date().toISOString(), rejection_reason: data.reason })
    .eq("id", data.requestId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export const rejectB2BApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string; reason?: string }) => {
    if (!input?.requestId) throw new Error("requestId is required.");
    return { requestId: input.requestId, reason: input.reason?.trim() || null };
  })
  .handler(async ({ data, context }) => rejectB2BApplicationImpl(data, context as any));

export async function updateB2BCompanyPaymentTermsImpl(
  data: { companyId: string; paymentTerms: "pay_now" | "pay_later"; paymentTermsTemplateId: string | null; paymentTermsTemplateName: string | null },
  context: AdminContext,
  deps: { applyTerms: typeof applyPaymentTermsToShopify } = { applyTerms: applyPaymentTermsToShopify },
) {
  await assertAdmin(context);
  const client = context.supabase;
  const { data: company, error: loadError } = await client
    .from("b2b_companies")
    .select("shopify_company_location_id")
    .eq("id", data.companyId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!company) throw new Error("Company not found.");

  await deps.applyTerms(company.shopify_company_location_id, data.paymentTermsTemplateId);

  const { error: updateError } = await client
    .from("b2b_companies")
    .update({
      payment_terms: data.paymentTerms,
      payment_terms_template_id: data.paymentTermsTemplateId,
      payment_terms_template_name: data.paymentTermsTemplateName,
      approved_by: context.userId,
    })
    .eq("id", data.companyId);
  if (updateError) throw new Error(updateError.message);
  return { ok: true };
}

export const updateB2BCompanyPaymentTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; paymentTerms: "pay_now" | "pay_later"; paymentTermsTemplateId?: string; paymentTermsTemplateName?: string }) => {
    if (!input?.companyId) throw new Error("companyId is required.");
    const { paymentTerms, paymentTermsTemplateId } = validatePaymentTermsChoice(input.paymentTerms, input.paymentTermsTemplateId);
    return {
      companyId: input.companyId,
      paymentTerms,
      paymentTermsTemplateId,
      paymentTermsTemplateName: paymentTerms === "pay_later" ? (input.paymentTermsTemplateName?.trim() || null) : null,
    };
  })
  .handler(async ({ data, context }) => {
    if (!WEBSITE_B2B_APPROVAL_ENABLED) throw new Error(APPROVAL_IN_SHOPIFY_MESSAGE);
    return updateB2BCompanyPaymentTermsImpl(data, context as any);
  });

const LIST_ALL_COMPANIES_QUERY = `
  query ListAllCompanies($after: String) {
    companies(first: 250, after: $after) {
      edges {
        cursor
        node {
          id
          name
          externalId
          locations(first: 1) { edges { node { id } } }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

type CompanyListNode = { id: string; name: string; externalId: string | null; locations: { edges: Array<{ node: { id: string } }> } };
type CompanyListPage = { companies: { edges: Array<{ cursor: string; node: CompanyListNode }>; pageInfo: { hasNextPage: boolean } } };
const MAX_SYNC_PAGES = 20;

/**
 * One-off grandfathering backfill, admin-triggered only (never runs
 * automatically). Mirrors every Shopify Company that already exists
 * (built by the fully-automatic flow this feature replaces) into
 * b2b_companies as `approved`/`pay_now` -- i.e. exactly their current
 * real behavior, no access change -- and marks any business_account_requests
 * row for the same GST as `approved` too, so it stops showing as a fresh
 * pending application. Writes to Supabase ONLY; never calls a Shopify
 * mutation, so it's safe to run multiple times (skips a GST already
 * present in b2b_companies).
 */
export async function syncExistingShopifyCompaniesImpl(context: AdminContext) {
  await assertAdmin(context);
  const client = context.supabase;

  const companies: CompanyListNode[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_SYNC_PAGES; page++) {
    const result: { data: CompanyListPage | null; errors: Array<{ message: string }> } =
      await adminGraphQLRequest<CompanyListPage>(LIST_ALL_COMPANIES_QUERY, { after });
    if (result.errors?.length) throw new Error(result.errors.map((e: { message: string }) => e.message).join("; "));
    const edges: Array<{ cursor: string; node: CompanyListNode }> = result.data?.companies.edges ?? [];
    for (const edge of edges) companies.push(edge.node);
    if (!result.data?.companies.pageInfo.hasNextPage) break;
    after = edges[edges.length - 1]?.cursor ?? null;
  }

  let created = 0;
  let skipped = 0;
  for (const company of companies) {
    // Only ever created by this app's own setup flow -- a merchant-
    // configured Company has no externalId (confirmed live, see
    // b2b-company-setup.functions.ts's own header comment).
    if (!company.externalId) { skipped++; continue; }
    const locationId = company.locations.edges[0]?.node.id;
    if (!locationId) { skipped++; continue; }

    const { data: existing } = await client.from("b2b_companies").select("id").eq("gst_number", company.externalId).maybeSingle();
    if (existing) { skipped++; continue; }

    const { data: inserted, error: insertError } = await client
      .from("b2b_companies")
      .insert({
        gst_number: company.externalId,
        company_name: company.name,
        shopify_company_id: company.id,
        shopify_company_location_id: locationId,
        payment_terms: "pay_now",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    created++;

    await client
      .from("business_account_requests")
      .update({ status: "approved", b2b_company_id: inserted.id, reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
      .eq("gst_number", company.externalId)
      .eq("status", "pending");
  }

  return { ok: true, companiesFound: companies.length, created, skipped };
}

export const syncExistingShopifyCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => syncExistingShopifyCompaniesImpl(context as any));
