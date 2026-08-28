import https from 'node:https';

const data = JSON.stringify({
  query: "query { collections(first: 50) { edges { node { id title handle } } } }"
});

const options = {
  hostname: 'smb1m3-0k.myshopify.com',
  path: '/api/2025-07/graphql.json',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Storefront-Access-Token': '3a2ae2d30877cebfeeeb9a7c1f923587',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (d) => { body += d; });
  res.on('end', () => {
    const json = JSON.parse(body);
    console.log(JSON.stringify(json.data.collections.edges.map(e => e.node), null, 2));
  });
});

req.write(data);
req.end();
