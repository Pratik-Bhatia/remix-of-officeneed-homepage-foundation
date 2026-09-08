const token = "REMOVED_TOKEN";
const domain = "har1k4-di.myshopify.com";

const query = `
{
  products(first: 1, query: "title:*Logitech Lift*") {
    edges {
      node {
        descriptionHtml
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
.then(json => console.log(json.data.products.edges[0].node.descriptionHtml))
.catch(err => console.error(err));
