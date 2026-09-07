const token = "f1e68506c43205c33a20d5d20d4916b8";
const domain = "har1k4-di.myshopify.com";

const query = `
{
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
.then(json => console.log(JSON.stringify(json.data.collections.edges.map(e => e.node), null, 2)))
.catch(err => console.error(err));
