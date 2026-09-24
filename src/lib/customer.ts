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

export function getCustomerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken: string; expiresAt: string };
    if (!parsed.accessToken) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
      window.localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return parsed.accessToken;
  } catch {
    return null;
  }
}

function setCustomerToken(value: { accessToken: string; expiresAt: string } | null) {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(TOKEN_KEY, JSON.stringify(value));
  else window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

/** Clear a stale Shopify token and ask the shopper to sign in again. */
function handleExpiredSession() {
  if (typeof window === "undefined") return;
  if (!window.localStorage.getItem(TOKEN_KEY)) return;
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

export async function signInCustomer(email: string, password: string): Promise<void> {
  const resp = await storefrontApiRequest(
    `mutation Login($input: CustomerAccessTokenCreateInput!) {
       customerAccessTokenCreate(input: $input) {
         customerAccessToken { accessToken expiresAt }
         customerUserErrors { message }
       }
     }`,
    { input: { email, password } },
  );
  const result = (resp?.data as {
    customerAccessTokenCreate: {
      customerAccessToken: { accessToken: string; expiresAt: string } | null;
      customerUserErrors: Array<{ message: string }>;
    };
  }).customerAccessTokenCreate;
  if (!result.customerAccessToken) {
    throw new Error(result.customerUserErrors[0]?.message ?? "Incorrect email or password.");
  }
  setCustomerToken(result.customerAccessToken);
}

export async function registerCustomer(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<void> {
  try {
    const resp = await storefrontApiRequest(
      `mutation Register($input: CustomerCreateInput!) {
         customerCreate(input: $input) { customerUserErrors { message } }
       }`,
      { input },
    );
    const errors = (resp?.data as { customerCreate: { customerUserErrors: Array<{ message: string }> } })
      .customerCreate.customerUserErrors;
    if (errors.length) throw new Error(errors[0]?.message ?? "Could not create your account.");
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
    const current = getCustomerToken();
    setToken(current);
    if (!current) {
      setCustomer(null);
      setStatus("out");
      return;
    }
    try {
      const data = await fetchCustomer(current);
      if (!data) {
        // Shopify returns customer: null for an expired/revoked token.
        handleExpiredSession();
        setCustomer(null);
        setStatus("out");
        return;
      }
      setCustomer(data);
      setStatus("in");
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (/access token|unidentified|invalid|expired|unauthori/.test(message)) {
        handleExpiredSession();
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
