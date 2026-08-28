const fetch = require('node-fetch');

const SHOPIFY_API_VERSION = "2025-07";
const SHOPIFY_STORE_PERMANENT_DOMAIN = "smb1m3-0k.myshopify.com";
const SHOPIFY_STOREFRONT_URL = "https://" + SHOPIFY_STORE_PERMANENT_DOMAIN + "/api/" + SHOPIFY_API_VERSION + "/graphql.json";
const SHOPIFY_STOREFRONT_TOKEN = "3a2ae2d30877cebfeeeb9a7c1f923587";

const query = 
  query {
    collections(first: 50) {
      edges {
        node {
          id
          title
          handle
        }
      }
    }
  }
;

fetch(SHOPIFY_STOREFRONT_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
  },
  body: JSON.stringify({ query })
}).then(res => res.json()).then(data => {
  console.log(JSON.stringify(data.data.collections.edges.map(e => e.node), null, 2));
});
