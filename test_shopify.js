const q = \query { product(handle: "premium-2-in-1-corporate-gift-set-diary-metal-pen-h938") { title vendor availableForSale totalInventory metafields(first: 50) { edges { node { namespace key value } } } } }\;
fetch('https://har1k4-di.myshopify.com/api/2025-07/graphql.json', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': 'f1e68506c43205c33a20d5d20d4916b8' },
  body: JSON.stringify({ query: q })
}).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2))).catch(console.error);
