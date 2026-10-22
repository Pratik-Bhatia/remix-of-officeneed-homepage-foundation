import test from "node:test";
import assert from "node:assert/strict";

// We simulate browser environment to test the exact analytics mechanics.
test("google-analytics: safe no-op when window is undefined or ID invalid", async () => {
  // Clear any existing globals
  const origWindow = globalThis.window;
  const origDocument = globalThis.document;
  delete globalThis.window;
  delete globalThis.document;

  const ga = await import("./google-analytics.ts");
  // Should not throw in SSR / non-browser context
  assert.equal(ga.initGoogleAnalytics(), false);
  assert.doesNotThrow(() => ga.trackGooglePageView("/test"));
  assert.doesNotThrow(() => ga.trackGoogleSearch("pens"));
  assert.doesNotThrow(() =>
    ga.trackGoogleViewItem({
      variantId: "123",
      name: "Test Pen",
      price: 100,
    }),
  );

  // Restore
  if (origWindow) globalThis.window = origWindow;
  if (origDocument) globalThis.document = origDocument;
});

test("google-analytics: full browser flow with valid ID, partner developer ID, and deduplication", async () => {
  const dispatchedEvents = [];
  const scriptsCreated = [];

  // Mock DOM and window
  const mockDocument = {
    head: {
      appendChild(node) {
        scriptsCreated.push(node);
      },
    },
    querySelector(selector) {
      return scriptsCreated.find((s) => s.dataset?.officeneedGoogleAnalytics === "true") ?? null;
    },
    createElement(tag) {
      return { tagName: tag.toUpperCase(), dataset: {}, async: false, src: "" };
    },
  };

  const mockWindow = {
    location: { origin: "https://officeneed.store" },
  };

  globalThis.window = mockWindow;
  globalThis.document = mockDocument;

  // Re-import with mocked environment having valid ID
  const testId = "G-TESTMEASURE123";
  process.env.VITE_GA_MEASUREMENT_ID = testId;
  process.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY = testId;

  // Clear module cache
  const ga = await import("./google-analytics.ts?t=" + Date.now());

  // Trigger page view on /shop
  ga.trackGooglePageView("/shop");

  // Verify gtag function created
  assert.equal(typeof mockWindow.gtag, "function");
  assert.ok(Array.isArray(mockWindow.dataLayer));

  // Verify partner developer ID
  const devIdCall = mockWindow.dataLayer.find((args) => args[0] === "set" && args[1] === "developer_id.dZjgwMW");
  assert.ok(devIdCall, "Should set Lovable partner developer_id.dZjgwMW");

  // Verify config call
  const configCall = mockWindow.dataLayer.find((args) => args[0] === "config");
  assert.ok(configCall, "Should configure GA with measurement ID");

  // Verify script tag created
  assert.equal(scriptsCreated.length, 1);
  assert.equal(scriptsCreated[0].dataset.officeneedGoogleAnalytics, "true");
  assert.ok(scriptsCreated[0].src.includes("googletagmanager.com/gtag/js?id="));

  // Verify page_view event in dataLayer
  const pageViewCall = mockWindow.dataLayer.find((args) => args[0] === "event" && args[1] === "page_view");
  assert.ok(pageViewCall);
  assert.equal(pageViewCall[2].page_path, "/shop");
  assert.equal(pageViewCall[2].page_location, "https://officeneed.store/shop");

  // Test deduplication: identical path should NOT add another page_view
  const countBefore = mockWindow.dataLayer.filter((args) => args[0] === "event" && args[1] === "page_view").length;
  ga.trackGooglePageView("/shop");
  const countAfter = mockWindow.dataLayer.filter((args) => args[0] === "event" && args[1] === "page_view").length;
  assert.equal(countBefore, countAfter, "Identical consecutive path must be deduplicated");

  // Test new navigation
  ga.trackGooglePageView("/products/premium-leather-notebook");
  const newPathCall = mockWindow.dataLayer.filter((args) => args[0] === "event" && args[1] === "page_view").pop();
  assert.equal(newPathCall[2].page_path, "/products/premium-leather-notebook");

  // Clean up
  delete process.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY;
});

test("google-analytics: ecommerce events formatting and parameters", async () => {
  const events = [];

  const mockWindow = {
    location: { origin: "https://officeneed.store" },
    gtag(...args) {
      events.push(args);
    },
    dataLayer: [],
  };

  const mockDocument = {
    head: { appendChild() {} },
    querySelector() {
      return { dataset: { officeneedGoogleAnalytics: "true" } };
    },
    createElement() {
      return { dataset: {} };
    },
  };

  globalThis.window = mockWindow;
  globalThis.document = mockDocument;

  process.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY = "G-ECOMMERCE123";
  const ga = await import("./google-analytics.ts?t=" + (Date.now() + 1));

  // 1. view_item
  ga.trackGoogleViewItem({
    variantId: "gid://shopify/ProductVariant/44556677",
    name: "Montblanc Rollerball Pen",
    price: 3200,
    currency: "INR",
    category: "Luxury Pens",
  });
  const viewItem = events.find((e) => e[1] === "view_item");
  assert.ok(viewItem);
  assert.equal(viewItem[2].currency, "INR");
  assert.equal(viewItem[2].value, 3200);
  assert.equal(viewItem[2].items[0].item_id, "44556677");
  assert.equal(viewItem[2].items[0].item_name, "Montblanc Rollerball Pen");

  // 2. view_item_list
  ga.trackGoogleViewItemList({
    listName: "Stationery Bestsellers",
    items: [
      { id: "gid://shopify/Product/111", name: "Notebook", price: 450, category: "Notebooks" },
      { id: "gid://shopify/Product/222", name: "Sticky Notes", price: 120, category: "Stationery" },
    ],
  });
  const viewItemList = events.find((e) => e[1] === "view_item_list");
  assert.ok(viewItemList);
  assert.equal(viewItemList[2].item_list_name, "Stationery Bestsellers");
  assert.equal(viewItemList[2].items.length, 2);
  assert.equal(viewItemList[2].items[0].item_id, "111");

  // 3. search
  ga.trackGoogleSearch("diary 2026");
  const searchEvent = events.find((e) => e[1] === "search");
  assert.ok(searchEvent);
  assert.equal(searchEvent[2].search_term, "diary 2026");

  // 4. add_to_cart
  ga.trackGoogleAddToCart({
    variantId: "gid://shopify/ProductVariant/44556677",
    name: "Montblanc Rollerball Pen",
    price: 3200,
    currency: "INR",
    quantity: 2,
    category: "Luxury Pens",
  });
  const addToCart = events.find((e) => e[1] === "add_to_cart");
  assert.ok(addToCart);
  assert.equal(addToCart[2].currency, "INR");
  assert.equal(addToCart[2].value, 6400);
  assert.equal(addToCart[2].items[0].quantity, 2);

  // 5. remove_from_cart
  ga.trackGoogleRemoveFromCart({
    variantId: "gid://shopify/ProductVariant/44556677",
    name: "Montblanc Rollerball Pen",
    price: 3200,
    currency: "INR",
    quantity: 1,
  });
  const removeFromCart = events.find((e) => e[1] === "remove_from_cart");
  assert.ok(removeFromCart);
  assert.equal(removeFromCart[2].value, 3200);

  // 6. view_cart
  ga.trackGoogleViewCart({
    items: [
      { variantId: "44556677", name: "Montblanc Rollerball Pen", price: 3200, quantity: 1 },
      { variantId: "998877", name: "A5 Notebook", price: 300, quantity: 3 },
    ],
    value: 4100,
    currency: "INR",
  });
  const viewCart = events.find((e) => e[1] === "view_cart");
  assert.ok(viewCart);
  assert.equal(viewCart[2].value, 4100);
  assert.equal(viewCart[2].items.length, 2);

  // 7. begin_checkout
  ga.trackGoogleBeginCheckout({
    items: [
      {
        variantId: "gid://shopify/ProductVariant/44556677",
        name: "Montblanc Rollerball Pen",
        quantity: 2,
        price: { amount: "3200.00", currencyCode: "INR" },
      },
    ],
    value: 6400,
  });
  const beginCheckout = events.find((e) => e[1] === "begin_checkout");
  assert.ok(beginCheckout);
  assert.equal(beginCheckout[2].currency, "INR");
  assert.equal(beginCheckout[2].value, 6400);
  assert.equal(beginCheckout[2].items[0].item_id, "44556677");

  delete process.env.VITE_GA_MEASUREMENT_ID;
  delete process.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY;
});

test("google-analytics: verifies default Measurement ID is G-34E9F2S835", async () => {
  delete process.env.VITE_GA_MEASUREMENT_ID;
  delete process.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY;

  const ga = await import("./google-analytics.ts?t=" + Date.now());
  assert.equal(ga.GA_MEASUREMENT_ID, "G-34E9F2S835");
});

