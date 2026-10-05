/**
 * Shopify customer accounts via the Storefront API (classic customer accounts).
 * Handles sign-in, sign-up, profile and order history for the signed-in shopper.
 *
 * All Storefront API calls go through storefrontApiRequest() which proxies
 * via the server-side shopify.functions.ts — the token never reaches the browser.
 */
import { useCallback, useEffect, useState } from "react";
import { storefrontApiRequest, formatMoney } from "@/lib/shopify";

const TOKEN_KEY = "officeneed_customer_token";
const TOKEN_EVENT = "officeneed-customer-token";

export interface CustomerAddress {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
}

export interface CustomerOrderLine {
  title: string;
  quantity: number;
  imageUrl: string | null;
  total: string | null;
}

export interface CustomerOrder {
  id: string;
  name: string;
  processedAt: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  statusUrl: string | null;
  total: string;
  subtotal: string | null;
  shipping: string | null;
  tax: string | null;
  shippingAddress: string[];
  lines: CustomerOrderLine[];
}

export interface Customer {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  defaultAddress: CustomerAddress | null;
  addresses: CustomerAddress[];
  orders: CustomerOrder[];
}


/* ---------------------------------- token --------------------------------- */

interface StoredToken {
  accessToken: string;
  expiresAt?: string;
}

/** Read the stored token without side effects (does not clear expired tokens). */
function readStoredToken(): StoredToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    if (!parsed.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getCustomerToken(): string | null {
  const stored = readStoredToken();
  if (!stored) return null;
  if (stored.expiresAt && new Date(stored.expiresAt).getTime() < Date.now()) {
    return null;
  }
  return stored.accessToken;
}

function setCustomerToken(value: { accessToken: string; expiresAt: string } | null) {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(TOKEN_KEY, JSON.stringify(value));
  else window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

/** Clear a stale Shopify token and explicitly tell the shopper why. */
function notifyExpiredSession() {
  if (typeof window === "undefined") return;
  setCustomerToken(null);
  void import("sonner").then(({ toast }) =>
    toast.error("Your session expired. Please sign in again."),
  );
  window.dispatchEvent(new CustomEvent("open-auth-modal"));
}

/* --------------------------------- queries -------------------------------- */

const CUSTOMER_QUERY = `
  query Customer($token: String!) {
    customer(customerAccessToken: $token) {
      id
      email
      firstName
      lastName
      phone
      defaultAddress { id firstName lastName company address1 address2 city province zip country phone }
      addresses(first: 5) { edges { node { id firstName lastName company address1 address2 city province zip country phone } } }
      orders(first: 25, reverse: true) {
        edges {
          node {
            id
            name
            processedAt
            financialStatus
            fulfillmentStatus
            statusUrl
            currentTotalPrice { amount currencyCode }
            currentSubtotalPrice { amount currencyCode }
            totalShippingPrice { amount currencyCode }
            currentTotalTax { amount currencyCode }
            shippingAddress { firstName lastName address1 address2 city province zip country }
            lineItems(first: 25) {
              edges {
                node {
                  title
                  quantity
                  variant { image { url } }
                  originalTotalPrice { amount currencyCode }
                }
              }
            }
          }
        }
      }
    }
  }
`;

type Money = { amount: string; currencyCode: string };
const money = (m?: Money | null) => (m ? formatMoney(m.amount, m.currencyCode) : null);

type RawCustomer = {
  customer: null | {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    defaultAddress: CustomerAddress | null;
    addresses: { edges: Array<{ node: CustomerAddress }> };
    orders: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          processedAt: string;
          financialStatus: string | null;
          fulfillmentStatus: string | null;
          statusUrl: string | null;
          currentTotalPrice: { amount: string; currencyCode: string };
          currentSubtotalPrice?: Money | null;
          totalShippingPrice?: Money | null;
          currentTotalTax?: Money | null;
          shippingAddress?: CustomerAddress | null;
          lineItems: {
            edges: Array<{
              node: {
                title: string;
                quantity: number;
                variant: { image: { url: string } | null } | null;
                originalTotalPrice: { amount: string; currencyCode: string } | null;
              };
            }>;
          };
        };
      }>;
    };
  };
};

export async function fetchCustomer(token: string): Promise<Customer | null> {
  const resp = await storefrontApiRequest(CUSTOMER_QUERY, { token });
  const data = resp?.data as RawCustomer | undefined;
  const c = data?.customer;
  if (!c) return null;
  return {
    id: c.id,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    defaultAddress: c.defaultAddress,
    addresses: c.addresses.edges.map((e) => e.node),
    orders: c.orders.edges.map(({ node }) => ({
      id: node.id,
      name: node.name,
      processedAt: node.processedAt,
      financialStatus: node.financialStatus,
      fulfillmentStatus: node.fulfillmentStatus,
      statusUrl: node.statusUrl,
      total: formatMoney(node.currentTotalPrice.amount, node.currentTotalPrice.currencyCode),
      subtotal: money(node.currentSubtotalPrice),
      shipping: money(node.totalShippingPrice),
      tax: money(node.currentTotalTax),
      shippingAddress: node.shippingAddress
        ? [
            [node.shippingAddress.firstName, node.shippingAddress.lastName].filter(Boolean).join(" "),
            node.shippingAddress.address1 ?? "",
            node.shippingAddress.address2 ?? "",
            [node.shippingAddress.city, node.shippingAddress.province, node.shippingAddress.zip].filter(Boolean).join(", "),
            node.shippingAddress.country ?? "",
          ].filter(Boolean)
        : [],
      lines: node.lineItems.edges.filter((e) => e?.node).map(({ node: line }) => ({
        title: line.title,
        quantity: line.quantity,
        imageUrl: line.variant?.image?.url ?? null,
        total: line.originalTotalPrice
          ? formatMoney(line.originalTotalPrice.amount, line.originalTotalPrice.currencyCode)
          : null,
      })),
    })),
  };
}

/* --------------------------------- actions -------------------------------- */

/** Carries Shopify's own CustomerErrorCode (e.g. "TAKEN", "CUSTOMER_DISABLED",
 * "ALREADY_ENABLED", "TOKEN_INVALID") alongside the message, so callers can
 * branch on the stable code instead of matching locale-dependent message text. */
export class CustomerAuthError extends Error {
  code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.name = "CustomerAuthError";
    this.code = code;
  }
}

/**
 * Maps customerAccessTokenCreate's customerUserErrors to shopper-facing
 * text -- never Shopify's own wording (e.g. the literal message for
 * UNIDENTIFIED_CUSTOMER is "Unidentified customer.", confirmed live via
 * Storefront API schema introspection on this store, 2026-10).
 *
 * UNIDENTIFIED_CUSTOMER is deliberately Shopify's ONE code for both "wrong
 * password" and "no account with this email" -- it does not distinguish
 * them (this prevents account-enumeration: an attacker probing emails
 * would otherwise learn which ones exist). There is no other Storefront
 * API signal that safely tells the two apart, so both get the same
 * message rather than guessing/inventing a distinction Shopify doesn't
 * actually provide.
 */
function signInErrorMessage(code: string | null): string {
  switch (code) {
    case "CUSTOMER_DISABLED":
      return "Your account hasn't been activated yet. Please check your email for the activation link.";
    default:
      // UNIDENTIFIED_CUSTOMER and every other validation code
      // (BLANK/INVALID/TOO_SHORT/etc., or no code at all) all land here --
      // the one message that's true regardless of which was actually hit.
      return "Incorrect email or password. Please check your credentials and try again.";
  }
}

export async function signInCustomer(email: string, password: string): Promise<void> {
  const resp = await storefrontApiRequest(
    `mutation Login($input: CustomerAccessTokenCreateInput!) {
       customerAccessTokenCreate(input: $input) {
         customerAccessToken { accessToken expiresAt }
         customerUserErrors { code message }
       }
     }`,
    { input: { email, password } },
  );
  const result = (resp?.data as {
    customerAccessTokenCreate: {
      customerAccessToken: { accessToken: string; expiresAt: string } | null;
      customerUserErrors: Array<{ code: string | null; message: string }>;
    };
  }).customerAccessTokenCreate;
  if (!result.customerAccessToken) {
    const err = result.customerUserErrors[0];
    const code = err?.code ?? null;
    throw new CustomerAuthError(signInErrorMessage(code), code);
  }
  setCustomerToken(result.customerAccessToken);
}

export async function registerCustomer(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  /** Native Shopify customer field (CustomerCreateInput.phone) -- not
   * metafield data, so it's passed straight through like the rest of this
   * input. Optional and unused by existing B2C registration, which never
   * passes it -- that path's behavior is unchanged. */
  phone?: string;
}): Promise<void> {
  try {
    const resp = await storefrontApiRequest(
      `mutation Register($input: CustomerCreateInput!) {
         customerCreate(input: $input) { customerUserErrors { code field message } }
       }`,
      { input },
    );
    const errors = (resp?.data as { customerCreate: { customerUserErrors: Array<{ code: string | null; field?: string[] | null; message: string }> } })
      .customerCreate.customerUserErrors;
    const err = errors[0];
    if (err) {
      // Shopify returns code TAKEN for BOTH a duplicate email and a
      // duplicate phone -- the `field` path tells them apart. Only an email
      // conflict means "account exists, sign in"; a phone conflict gets its
      // own code so the modal does not switch to sign-in mode.
      if (err.code === "TAKEN" && err.field?.includes("phone")) {
        throw new CustomerAuthError(
          "This phone number is already linked to another account. Please use a different phone number.",
          "PHONE_TAKEN",
        );
      }
      if (err.code === "TAKEN") {
        throw new CustomerAuthError("An account already exists with this email. Please sign in.", err.code);
      }
      throw new CustomerAuthError(err.message ?? "Could not create your account.", err.code ?? null);
    }
    await signInCustomer(input.email, input.password);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("unauthenticated_write_customers")) {
      throw new Error(
        "Registration is currently disabled by store configuration. The Storefront API token is missing the 'unauthenticated_write_customers' permission.",
      );
    }
    throw error;
  }
}

/**
 * Classic Shopify customer account activation (shopify.dev/docs/storefronts/
 * headless/building-with-the-storefront-api/customer-accounts): the
 * activation email links to OUR storefront with Shopify's own
 * account_activation_url carried through as the `activation_url` query
 * param (see src/routes/account.activate.tsx) -- we pass that URL to
 * Shopify VERBATIM, never parsed apart. customerActivateByUrl is Shopify's
 * own documented recommended mutation for exactly this (no need to
 * separately extract the customer id/token from the URL). On success this
 * creates no second customer -- it activates the SAME Shopify customer the
 * link was issued for, and returns a real customerAccessToken for them,
 * stored via the existing setCustomerToken() (same path signInCustomer
 * uses), which already fires the officeneed-customer-token event.
 */
export async function activateCustomer(activationUrl: string, password: string): Promise<void> {
  const resp = await storefrontApiRequest(
    `mutation ActivateByUrl($activationUrl: URL!, $password: String!) {
       customerActivateByUrl(activationUrl: $activationUrl, password: $password) {
         customerAccessToken { accessToken expiresAt }
         customerUserErrors { code message }
       }
     }`,
    { activationUrl, password },
  );
  const result = (resp?.data as {
    customerActivateByUrl: {
      customerAccessToken: { accessToken: string; expiresAt: string } | null;
      customerUserErrors: Array<{ code: string | null; message: string }>;
    };
  }).customerActivateByUrl;
  if (!result.customerAccessToken) {
    const err = result.customerUserErrors[0];
    if (err?.code === "ALREADY_ENABLED") {
      throw new CustomerAuthError("This account has already been activated. Please sign in instead.", err.code);
    }
    if (err?.code === "TOKEN_INVALID" || err?.code === "NOT_FOUND") {
      throw new CustomerAuthError("This activation link is invalid or has expired. Please contact OfficeNeed for a new one.", err.code);
    }
    throw new CustomerAuthError(err?.message ?? "Could not activate your account.", err?.code ?? null);
  }
  setCustomerToken(result.customerAccessToken);
}

/**
 * Classic Shopify "forgot password" (shopify.dev customerRecover mutation)
 * -- triggers Shopify's own password-reset email for this address, same
 * account/password system as everywhere else in this file.
 *
 * SECURITY: confirmed live against this store that customerRecover's
 * customerUserErrors DOES distinguish a real account (empty errors) from
 * a nonexistent one (UNIDENTIFIED_CUSTOMER / "Could not find customer") --
 * surfacing that would be exactly the account-enumeration leak the
 * business requirement forbids. So this function deliberately NEVER
 * inspects or surfaces customerUserErrors: as long as the request itself
 * reaches Shopify, it resolves normally either way. It only throws on a
 * genuine transport/infra failure (storefrontApiRequest itself throwing),
 * which the caller can tell apart from "request processed" -- but never
 * from "that email doesn't exist".
 */
export async function requestPasswordRecovery(email: string): Promise<void> {
  await storefrontApiRequest(
    `mutation Recover($email: String!) {
       customerRecover(email: $email) { customerUserErrors { code message } }
     }`,
    { email },
  );
}

/**
 * Completes a classic Shopify password reset -- the reset email links to
 * OUR storefront with Shopify's own account_reset_url carried through
 * verbatim as a query param (see src/routes/password-reset.tsx), exactly
 * the same pattern activateCustomer/customerActivateByUrl above uses for
 * activation. customerResetByUrl is Shopify's own documented mutation for
 * this. On success it returns a real customerAccessToken for the SAME
 * customer, stored via the existing setCustomerToken() -- same event,
 * same path as every other sign-in in this file.
 */
export async function resetPasswordByUrl(resetUrl: string, password: string): Promise<void> {
  let resp: Awaited<ReturnType<typeof storefrontApiRequest>>;
  try {
    resp = await storefrontApiRequest(
      `mutation ResetByUrl($resetUrl: URL!, $password: String!) {
         customerResetByUrl(resetUrl: $resetUrl, password: $password) {
           customerAccessToken { accessToken expiresAt }
           customerUserErrors { code message }
         }
       }`,
      { resetUrl, password },
    );
  } catch {
    // Confirmed live: a reset URL whose customer id doesn't resolve at all
    // fails as a top-level GraphQL error (Shopify's raw "Unidentified
    // customer"), not a customerUserErrors entry -- same user-facing
    // outcome as an invalid/expired link either way, never Shopify's
    // internal wording.
    throw new CustomerAuthError("This password reset link is invalid or has expired. Please request a new one.", null);
  }
  const result = (resp?.data as {
    customerResetByUrl: {
      customerAccessToken: { accessToken: string; expiresAt: string } | null;
      customerUserErrors: Array<{ code: string | null; message: string }>;
    };
  }).customerResetByUrl;
  if (!result.customerAccessToken) {
    const err = result.customerUserErrors[0];
    const code = err?.code ?? null;
    // INVALID is the code Shopify returns for a real-customer reset URL
    // whose token portion is wrong/expired/already used (confirmed live,
    // message "Invalid reset url"); TOKEN_INVALID/NOT_FOUND cover the
    // same family of failure as the activation flow above. Nothing here
    // ever passes Shopify's own err.message through.
    if (code === "INVALID" || code === "TOKEN_INVALID" || code === "NOT_FOUND") {
      throw new CustomerAuthError("This password reset link is invalid or has expired. Please request a new one.", code);
    }
    throw new CustomerAuthError("Could not reset your password. Please try again.", code);
  }
  setCustomerToken(result.customerAccessToken);
}

export async function updateCustomer(
  token: string,
  input: { firstName?: string; lastName?: string; phone?: string },
): Promise<void> {
  const resp = await storefrontApiRequest(
    `mutation UpdateCustomer($token: String!, $customer: CustomerUpdateInput!) {
       customerUpdate(customerAccessToken: $token, customer: $customer) {
         customerUserErrors { message }
       }
     }`,
    { token, customer: input },
  );
  const errors = (resp?.data as { customerUpdate: { customerUserErrors: Array<{ message: string }> } })
    .customerUpdate.customerUserErrors;
  if (errors.length) throw new Error(errors[0]?.message ?? "Could not save your details.");
}

/* --------------------------------- addresses --------------------------------- */
// Classic Shopify customer Address Book -- MailingAddressInput, confirmed live
// against this store's Storefront API 2026-10 schema: address1, address2,
// city, company, country (plain string, not an ISO code), firstName,
// lastName, phone, province, zip. Shopify itself is the only store for this
// data -- no local/Supabase address table exists or is introduced here.
export type CustomerAddressInput = Omit<CustomerAddress, "id">;

const ADDRESS_FIELDS_GQL = "id firstName lastName company address1 address2 city province zip country phone";

export async function createCustomerAddress(token: string, address: CustomerAddressInput): Promise<CustomerAddress> {
  const resp = await storefrontApiRequest(
    `mutation CreateAddress($token: String!, $address: MailingAddressInput!) {
       customerAddressCreate(customerAccessToken: $token, address: $address) {
         customerAddress { ${ADDRESS_FIELDS_GQL} }
         customerUserErrors { message }
       }
     }`,
    { token, address },
  );
  const result = (resp?.data as {
    customerAddressCreate: { customerAddress: CustomerAddress | null; customerUserErrors: Array<{ message: string }> };
  }).customerAddressCreate;
  if (result.customerUserErrors.length) {
    throw new Error(result.customerUserErrors[0]?.message ?? "Could not save this address.");
  }
  if (!result.customerAddress) throw new Error("Could not save this address.");
  return result.customerAddress;
}

export async function updateCustomerAddress(
  token: string,
  addressId: string,
  address: CustomerAddressInput,
): Promise<CustomerAddress> {
  const resp = await storefrontApiRequest(
    `mutation UpdateAddress($token: String!, $id: ID!, $address: MailingAddressInput!) {
       customerAddressUpdate(customerAccessToken: $token, id: $id, address: $address) {
         customerAddress { ${ADDRESS_FIELDS_GQL} }
         customerUserErrors { message }
       }
     }`,
    { token, id: addressId, address },
  );
  const result = (resp?.data as {
    customerAddressUpdate: { customerAddress: CustomerAddress | null; customerUserErrors: Array<{ message: string }> };
  }).customerAddressUpdate;
  if (result.customerUserErrors.length) {
    throw new Error(result.customerUserErrors[0]?.message ?? "Could not update this address.");
  }
  if (!result.customerAddress) throw new Error("Could not update this address.");
  return result.customerAddress;
}

export async function deleteCustomerAddress(token: string, addressId: string): Promise<void> {
  const resp = await storefrontApiRequest(
    `mutation DeleteAddress($token: String!, $id: ID!) {
       customerAddressDelete(customerAccessToken: $token, id: $id) {
         deletedCustomerAddressId
         customerUserErrors { message }
       }
     }`,
    { token, id: addressId },
  );
  const errors = (resp?.data as { customerAddressDelete: { customerUserErrors: Array<{ message: string }> } })
    .customerAddressDelete.customerUserErrors;
  if (errors.length) throw new Error(errors[0]?.message ?? "Could not delete this address.");
}

export async function setDefaultCustomerAddress(token: string, addressId: string): Promise<void> {
  const resp = await storefrontApiRequest(
    `mutation SetDefaultAddress($token: String!, $addressId: ID!) {
       customerDefaultAddressUpdate(customerAccessToken: $token, addressId: $addressId) {
         customerUserErrors { message }
       }
     }`,
    { token, addressId },
  );
  const errors = (resp?.data as { customerDefaultAddressUpdate: { customerUserErrors: Array<{ message: string }> } })
    .customerDefaultAddressUpdate.customerUserErrors;
  if (errors.length) throw new Error(errors[0]?.message ?? "Could not set this as your default address.");
}

export async function signOutCustomer(): Promise<void> {
  const token = getCustomerToken();
  setCustomerToken(null);
  if (!token) return;
  try {
    await storefrontApiRequest(
      `mutation Logout($token: String!) {
         customerAccessTokenDelete(customerAccessToken: $token) { deletedAccessToken }
       }`,
      { token },
    );
  } catch {
    /* token is already cleared locally */
  }
}

/* ---------------------------------- hook ---------------------------------- */

export function useCustomer() {
  const [token, setToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [status, setStatus] = useState<"checking" | "in" | "out">("checking");

  const load = useCallback(async () => {
    const stored = readStoredToken();
    const expired =
      !!stored?.expiresAt && new Date(stored.expiresAt).getTime() < Date.now();
    const current = stored && !expired ? stored.accessToken : null;
    setToken(current);

    if (!current) {
      // A token that was present but past its expiry should explain the logout,
      // not look like the shopper was never signed in.
      if (stored && expired) notifyExpiredSession();
      setCustomer(null);
      setStatus("out");
      return;
    }
    try {
      const data = await fetchCustomer(current);
      if (!data) {
        // Shopify returns customer: null for an expired/revoked token.
        notifyExpiredSession();
        setCustomer(null);
        setStatus("out");
        return;
      }
      setCustomer(data);
      setStatus("in");
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (/access token|unidentified|invalid|expired|unauthori/.test(message)) {
        notifyExpiredSession();
      }
      setCustomer(null);
      setStatus("out");
    }
  }, []);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener(TOKEN_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(TOKEN_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, [load]);

  return { token, customer, status, reload: load };
}
