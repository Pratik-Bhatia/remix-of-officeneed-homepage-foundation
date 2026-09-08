const token = "REMOVED_TOKEN";
const domain = "har1k4-di.myshopify.com";

const query = `
{
  collections(first: 50) {
    edges {
      node {
        title
        handle
        id
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
.then(json => {
  json.data.collections.edges.forEach(e => {
    console.log(`${e.node.title} -> ${e.node.handle}`);
  });
})
.catch(err => console.error(err));
