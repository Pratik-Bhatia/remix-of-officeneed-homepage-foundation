// Unit tests for src/lib/customer-orders.functions.ts -- the Admin API,
// purchasingEntity-based split of a signed-in customer's own order history
// into personal vs. business orders (see that file's header comment for
// why the Storefront API alone can't do this, and the known read_orders
// scope limitation this must degrade safely around).
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/customer-orders.functions.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@/lib/b2b.functions", {
  namedExports: {
    resolveCustomerIdFromToken: async (token) =>
      token === "token-invalid" ? null : "gid://shopify/Customer/42",
  },
});

let mockResult = { data: null, errors: [] };
let lastQueryVariables = null;
mock.module("@/lib/shopify-admin.server", {
  namedExports: {
    adminGraphQLRequest: async (_query, variables) => {
      lastQueryVariables = variables;
      return mockResult;
    },
  },
});

const { computeCustomerOrdersSplit } = await import("@/lib/customer-orders.functions");

function orderNode(overrides = {}) {
  return {
    id: "gid://shopify/Order/1",
    name: "#1001",
    processedAt: "2026-01-01T00:00:00Z",
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    statusPageUrl: "https://example.com/status/1",
    currentTotalPriceSet: { shopMoney: { amount: "500", currencyCode: "INR" } },
    currentSubtotalPriceSet: { shopMoney: { amount: "450", currencyCode: "INR" } },
    currentShippingPriceSet: { shopMoney: { amount: "50", currencyCode: "INR" } },
    currentTotalTaxSet: null,
    shippingAddress: null,
    purchasingEntity: null,
    lineItems: { edges: [] },
    ...overrides,
  };
}

test("returns an empty, non-scope-missing split when the token doesn't resolve to a real customer", async () => {
  mockResult = { data: null, errors: [] };
  const result = await computeCustomerOrdersSplit("token-invalid");
  assert.deepEqual(result, { personalOrders: [], businessOrders: [], scopeMissing: false });
});

test("flags scopeMissing when Shopify returns an ACCESS_DENIED error on the orders field", async () => {
  mockResult = {
    data: null,
    errors: [{ message: "Access denied for orders field.", extensions: { code: "ACCESS_DENIED" } }],
  };
  const result = await computeCustomerOrdersSplit("token-valid");
  assert.deepEqual(result, { personalOrders: [], businessOrders: [], scopeMissing: true });
});

test("a genuine non-ACCESS_DENIED error fails safe to an empty split WITHOUT claiming scopeMissing", async () => {
  mockResult = { data: null, errors: [{ message: "Something else went wrong." }] };
  const result = await computeCustomerOrdersSplit("token-valid");
  assert.deepEqual(result, { personalOrders: [], businessOrders: [], scopeMissing: false });
});

test("an order with purchasingEntity PurchasingCompany is classified as a business order", async () => {
  mockResult = {
    data: {
      customer: {
        orders: {
          edges: [
            { node: orderNode({ id: "gid://shopify/Order/biz", purchasingEntity: { __typename: "PurchasingCompany", company: { id: "gid://shopify/Company/9" } } }) },
          ],
        },
      },
    },
    errors: [],
  };
  const result = await computeCustomerOrdersSplit("token-valid");
  assert.equal(result.scopeMissing, false);
  assert.equal(result.businessOrders.length, 1);
  assert.equal(result.personalOrders.length, 0);
  assert.equal(result.businessOrders[0].id, "gid://shopify/Order/biz");
});

test("an order with purchasingEntity Customer (or no purchasingEntity at all) is classified as personal", async () => {
  mockResult = {
    data: {
      customer: {
        orders: {
          edges: [
            { node: orderNode({ id: "gid://shopify/Order/a", purchasingEntity: { __typename: "Customer" } }) },
            { node: orderNode({ id: "gid://shopify/Order/b", purchasingEntity: null }) },
          ],
        },
      },
    },
    errors: [],
  };
  const result = await computeCustomerOrdersSplit("token-valid");
  assert.equal(result.personalOrders.length, 2);
  assert.equal(result.businessOrders.length, 0);
});

test("a mixed order history is split correctly, preserving every order exactly once", async () => {
  mockResult = {
    data: {
      customer: {
        orders: {
          edges: [
            { node: orderNode({ id: "gid://shopify/Order/p1", purchasingEntity: null }) },
            { node: orderNode({ id: "gid://shopify/Order/b1", purchasingEntity: { __typename: "PurchasingCompany", company: { id: "gid://shopify/Company/1" } } }) },
            { node: orderNode({ id: "gid://shopify/Order/p2", purchasingEntity: { __typename: "Customer" } }) },
          ],
        },
      },
    },
    errors: [],
  };
  const result = await computeCustomerOrdersSplit("token-valid");
  assert.deepEqual(result.personalOrders.map((o) => o.id), ["gid://shopify/Order/p1", "gid://shopify/Order/p2"]);
  assert.deepEqual(result.businessOrders.map((o) => o.id), ["gid://shopify/Order/b1"]);
});

test("money/status/line-item fields are mapped onto the shared CustomerOrder shape correctly", async () => {
  mockResult = {
    data: {
      customer: {
        orders: {
          edges: [
            {
              node: orderNode({
                shippingAddress: { firstName: "A", lastName: "B", address1: "123 St", address2: null, city: "Mumbai", province: "Maharashtra", zip: "400001", country: "India", phone: null },
                lineItems: { edges: [{ node: { title: "Pen", quantity: 3, image: { url: "https://example.com/pen.jpg" }, originalTotalSet: { shopMoney: { amount: "150", currencyCode: "INR" } } } }] },
              }),
            },
          ],
        },
      },
    },
    errors: [],
  };
  const result = await computeCustomerOrdersSplit("token-valid");
  const order = result.personalOrders[0];
  assert.equal(order.financialStatus, "PAID");
  assert.equal(order.fulfillmentStatus, "FULFILLED");
  assert.ok(order.total.includes("500"));
  assert.ok(order.subtotal.includes("450"));
  assert.ok(order.shipping.includes("50"));
  assert.equal(order.tax, null);
  assert.deepEqual(order.shippingAddress, ["A B", "123 St", "Mumbai, Maharashtra, 400001", "India"]);
  assert.equal(order.lines.length, 1);
  assert.equal(order.lines[0].title, "Pen");
  assert.equal(order.lines[0].quantity, 3);
  assert.equal(order.lines[0].imageUrl, "https://example.com/pen.jpg");
});

test("queries the Admin API with the server-resolved customerId, never anything client-supplied", async () => {
  mockResult = { data: { customer: { orders: { edges: [] } } }, errors: [] };
  await computeCustomerOrdersSplit("token-valid");
  assert.deepEqual(lastQueryVariables, { customerId: "gid://shopify/Customer/42" });
});
