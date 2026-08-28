import { fetchProducts, storefrontApiRequest } from './src/lib/shopify';

const COLLECTIONS_QUERY = 
  query {
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
;

async function run() {
  const data = await storefrontApiRequest(COLLECTIONS_QUERY);
  console.log(JSON.stringify(data.data.collections.edges.map(e => e.node), null, 2));
}

run();
