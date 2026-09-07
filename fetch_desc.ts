import { fetchProducts } from "./src/lib/shopify";

async function run() {
  const edges = await fetchProducts(50);
  const data = edges.map(e => ({
    title: e.node.title,
    type: e.node.productType,
    desc: e.node.description,
    descHtml: e.node.descriptionHtml
  }));
  console.log(JSON.stringify(data.slice(0, 5), null, 2));
}

run();
