/**
 * Splits a signed-in customer's own order history into personal vs.
 * business orders, server-side, using Shopify's real `Order.purchasingEntity`
 * field (Admin API only -- confirmed live via schema introspection that the
 * classic Storefront API's `customer.orders` query, used by
 * src/lib/customer.ts's fetchCustomer(), has NO field that distinguishes a
 * company-context order from a personal one). This is NOT an invented
 * classification rule -- purchasingEntity is Shopify's own real signal for
 * exactly this distinction.
 *
 * Deliberately scoped through `customer(id).orders`, never
 * `companyLocation(id).orders` -- the latter would return every order ANY
 * contact at that company location ever placed, leaking colleagues' order
 * data into this one customer's "business orders" view. Classification here
 * only ever looks at orders this specific authenticated customer placed.
 *
 * Same trust chain as src/lib/b2b.functions.ts: resolveCustomerIdFromToken
 * is the only identity proof trusted here, never anything client-supplied.
 *
 * KNOWN LIMITATION (confirmed live, 2026-10): this store's Admin API app
 * credential does not currently have the `read_orders` scope granted --
 * every orders-field query returns a GraphQL ACCESS_DENIED error (confirmed
 * live against `orders`, `customer(id).orders`, and
 * `companyLocation(id).orders` alike). Until that scope is granted (Shopify
 * Admin -> Settings -> Apps and sales channels -> this app -> Configuration),
 * `scopeMissing: true` is returned and callers must fall back gracefully --
 * never guess a split from data that was never actually readable.
 */
import { createServerFn } from "@tanstack/react-start";
import { adminGraphQLRequest } from "@/lib/shopify-admin.server";
import { resolveCustomerIdFromToken } from "@/lib/b2b.functions";
import { formatMoney } from "@/lib/shopify";
import type { CustomerOrder } from "@/lib/customer";

export type CustomerOrdersSplit = {
  personalOrders: CustomerOrder[];
  businessOrders: CustomerOrder[];
  /** True when the split could not be computed because the Admin API
   * credential lacks the `read_orders` scope -- NOT the same as "this
   * customer has zero orders". Callers must never treat an empty list
   * caused by this as a genuine empty order history. */
  scopeMissing: boolean;
};

const CUSTOMER_ORDERS_QUERY = `
  query CustomerOrdersForSplit($customerId: ID!) {
    customer(id: $customerId) {
      orders(first: 50, sortKey: PROCESSED_AT, reverse: true) {
        edges {
          node {
            id
            name
            processedAt
            displayFinancialStatus
            displayFulfillmentStatus
            statusPageUrl
            currentTotalPriceSet { shopMoney { amount currencyCode } }
            currentSubtotalPriceSet { shopMoney { amount currencyCode } }
            currentShippingPriceSet { shopMoney { amount currencyCode } }
            currentTotalTaxSet { shopMoney { amount currencyCode } }
            shippingAddress { firstName lastName address1 address2 city province zip country phone }
            purchasingEntity {
              __typename
              ... on PurchasingCompany {
                company { id }
              }
            }
            lineItems(first: 25) {
              edges {
                node {
                  title
                  quantity
                  image { url }
                  originalTotalSet { shopMoney { amount currencyCode } }
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
type MoneyBag = { shopMoney: Money };
const money = (bag?: MoneyBag | null) => (bag ? formatMoney(bag.shopMoney.amount, bag.shopMoney.currencyCode) : null);

type AdminOrdersData = {
  customer: {
    orders: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          processedAt: string;
          displayFinancialStatus: string | null;
          displayFulfillmentStatus: string | null;
          statusPageUrl: string | null;
          currentTotalPriceSet: MoneyBag;
          currentSubtotalPriceSet?: MoneyBag | null;
          currentShippingPriceSet?: MoneyBag | null;
          currentTotalTaxSet?: MoneyBag | null;
          shippingAddress?: {
            firstName: string | null;
            lastName: string | null;
            address1: string | null;
            address2: string | null;
            city: string | null;
            province: string | null;
            zip: string | null;
            country: string | null;
            phone: string | null;
          } | null;
          purchasingEntity: { __typename: string; company?: { id: string } } | null;
          lineItems: {
            edges: Array<{
              node: {
                title: string;
                quantity: number;
                image: { url: string } | null;
                originalTotalSet: MoneyBag | null;
              };
            }>;
          };
        };
      }>;
    };
  } | null;
};

function mapOrderNode(node: AdminOrdersData["customer"] extends null ? never : NonNullable<AdminOrdersData["customer"]>["orders"]["edges"][number]["node"]): CustomerOrder {
  return {
    id: node.id,
    name: node.name,
    processedAt: node.processedAt,
    financialStatus: node.displayFinancialStatus,
    fulfillmentStatus: node.displayFulfillmentStatus,
    statusUrl: node.statusPageUrl,
    total: formatMoney(node.currentTotalPriceSet.shopMoney.amount, node.currentTotalPriceSet.shopMoney.currencyCode),
    subtotal: money(node.currentSubtotalPriceSet),
    shipping: money(node.currentShippingPriceSet),
    tax: money(node.currentTotalTaxSet),
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
      imageUrl: line.image?.url ?? null,
      total: line.originalTotalSet ? money(line.originalTotalSet) : null,
    })),
  };
}

/**
 * Plain, directly-testable implementation -- the createServerFn wrapper
 * below just calls this. Kept separate because a createServerFn-wrapped
 * function throws ("No Start context found in AsyncLocalStorage") when
 * invoked directly outside the TanStack Start server runtime, same
 * constraint src/lib/b2b.functions.ts's own test file works around by
 * testing its plain helper functions directly instead of resolveB2BSession.
 */
export async function computeCustomerOrdersSplit(customerAccessToken: string): Promise<CustomerOrdersSplit> {
  const customerId = await resolveCustomerIdFromToken(customerAccessToken);
  if (!customerId) return { personalOrders: [], businessOrders: [], scopeMissing: false };

  const result = await adminGraphQLRequest<AdminOrdersData>(CUSTOMER_ORDERS_QUERY, { customerId });

  if (result.errors?.some((e) => (e as { extensions?: { code?: string } }).extensions?.code === "ACCESS_DENIED")) {
    console.error("[Customer orders] Admin API orders access denied -- read_orders scope not granted to this app yet.");
    return { personalOrders: [], businessOrders: [], scopeMissing: true };
  }
  if (result.errors?.length) {
    console.error("[Customer orders] Admin API lookup returned errors:", result.errors.map((e) => e.message).join("; "));
    return { personalOrders: [], businessOrders: [], scopeMissing: false };
  }

  const edges = result.data?.customer?.orders.edges ?? [];
  const personalOrders: CustomerOrder[] = [];
  const businessOrders: CustomerOrder[] = [];
  for (const { node } of edges) {
    const order = mapOrderNode(node);
    if (node.purchasingEntity?.__typename === "PurchasingCompany") businessOrders.push(order);
    else personalOrders.push(order);
  }
  return { personalOrders, businessOrders, scopeMissing: false };
}

export const resolveCustomerOrders = createServerFn({ method: "POST" })
  .inputValidator((input: { customerAccessToken: string }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing or invalid customerAccessToken.");
    }
    return input;
  })
  .handler(({ data }): Promise<CustomerOrdersSplit> => computeCustomerOrdersSplit(data.customerAccessToken));
