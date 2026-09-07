const token = "f1e68506c43205c33a20d5d20d4916b8";
const domain = "har1k4-di.myshopify.com";

const query = `
{
  collections(first: 10, query: "title:*Perfume* OR title:*Fragrance*") {
    edges {
      node {
        title
        products(first: 20) {
          edges {
            node {
              title
              handle
              tags
            }
          }
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
