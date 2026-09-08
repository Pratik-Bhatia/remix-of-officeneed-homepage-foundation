const token = "REMOVED_TOKEN";
const domain = "har1k4-di.myshopify.com";

const query = `
{
  products(first: 63) {
    edges {
      node {
        title
        handle
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
.then(json => console.log(JSON.stringify(json.data.products.edges.filter(e => /file|folder|sheet protector/i.test(e.node.title)).map(e => e.node), null, 2)))
.catch(err => console.error(err));
