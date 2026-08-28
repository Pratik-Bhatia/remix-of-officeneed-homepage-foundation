import https from 'node:https';

const data = JSON.stringify({
  query: query {
    c1: collection(handle: "exclusive-products") { title products(first: 5) { edges { node { title } } } }
    c2: collection(handle: "office-stationary") { title products(first: 5) { edges { node { title } } } }
  }
});

const options = {
  hostname: 'smb1m3-0k.myshopify.com',
  path: '/api/2025-07/graphql.json',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Storefront-Access-Token': '3a2ae2d30877cebfeeeb9a7c1f923587',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (d) => { body += d; });
  res.on('end', () => {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  });
});

req.write(data);
req.end();
