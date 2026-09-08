const token = "REMOVED_TOKEN";
const domain = "har1k4-di.myshopify.com";

const query = `
{
  products(first: 60, query: "title:*Benelux Sheet Protector A/4 , F/c @ A/3  150 Micron*") {
    edges {
      node {
        title
        collections(first: 10) {
          edges {
            node {
              title
              handle
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
.then(json => console.log(JSON.stringify(json.data.products.edges[0].node, null, 2)))
.catch(err => console.error(err));
