/**
 * Shopify customer accounts via the Storefront API (classic customer accounts).
 * Handles sign-in, sign-up, profile and order history for the signed-in shopper.
 */
import { useCallback, useEffect, useState } from "react";
import {
  SHOPIFY_STOREFRONT_TOKEN,
  SHOPIFY_STOREFRONT_URL,
  formatMoney,
} from "@/lib/shopify";

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

async function storefront<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(SHOPIFY_STOREFRONT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Shopify request failed (${response.status})`);
  const json = await response.json();
  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "Shopify request failed");
  return json.data as T;
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
  const data = await storefront<RawCustomer>(CUSTOMER_QUERY, { token });
  const c = data.customer;
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
      lines: node.lineItems.edges.map(({ node: line }) => ({
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
  const data = await storefront<{
    customerAccessTokenCreate: {
      customerAccessToken: { accessToken: string; expiresAt: string } | null;
      customerUserErrors: Array<{ message: string }>;
    };
  }>(
    `mutation Login($input: CustomerAccessTokenCreateInput!) {
       customerAccessTokenCreate(input: $input) {
         customerAccessToken { accessToken expiresAt }
         customerUserErrors { message }
       }
     }`,
    { input: { email, password } },
  );
  const result = data.customerAccessTokenCreate;
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
  const data = await storefront<{
    customerCreate: { customerUserErrors: Array<{ message: string }> };
  }>(
    `mutation Register($input: CustomerCreateInput!) {
       customerCreate(input: $input) { customerUserErrors { message } }
     }`,
    { input },
  );
  const errors = data.customerCreate.customerUserErrors;
  if (errors.length) throw new Error(errors[0]?.message ?? "Could not create your account.");
  await signInCustomer(input.email, input.password);
}

export async function updateCustomer(
  token: string,
  input: { firstName?: string; lastName?: string; phone?: string },
): Promise<void> {
  const data = await storefront<{
    customerUpdate: { customerUserErrors: Array<{ message: string }> };
  }>(
    `mutation UpdateCustomer($token: String!, $customer: CustomerUpdateInput!) {
       customerUpdate(customerAccessToken: $token, customer: $customer) {
         customerUserErrors { message }
       }
     }`,
    { token, customer: input },
  );
  const errors = data.customerUpdate.customerUserErrors;
  if (errors.length) throw new Error(errors[0]?.message ?? "Could not save your details.");
}

export async function signOutCustomer(): Promise<void> {
  const token = getCustomerToken();
  setCustomerToken(null);
  if (!token) return;
  try {
    await storefront(
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
        setCustomerToken(null);
        setCustomer(null);
        setStatus("out");
        return;
      }
      setCustomer(data);
      setStatus("in");
    } catch {
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
