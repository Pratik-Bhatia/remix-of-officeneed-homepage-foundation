const token = "REMOVED_TOKEN";
const domain = "har1k4-di.myshopify.com";

const query = `
{
  collectionByHandle(handle: "european-perfume") {
    products(first: 10) {
      edges {
        node {
          title
          tags
        }
      }
    }
  }
}
`;

fetch(`https://${domain}/api/2025-07/graphql.json`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Storefront-Access-Token": token,
  },
  body: JSON.stringify({ query })
})
.then(res => res.json())
.then(json => console.log(JSON.stringify(json, null, 2)))
.catch(err => console.error(err));
