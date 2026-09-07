const token = "f1e68506c43205c33a20d5d20d4916b8";
const domain = "har1k4-di.myshopify.com";

const query = `
{
  products {
    totalCount
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
.then(json => console.log(json.data.products.totalCount))
.catch(err => console.error(err));
