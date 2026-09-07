import { fetchProducts } from "./src/lib/shopify";

async function run() {
  const edges = await fetchProducts(250);
  const products = edges.map(e => e.node.title);
  const perfumes = products.filter(p => /perfum|fragranc|attar|oud|eau de|deodor|cologne|armani|davidoff|versace|carolina/i.test(p));
  console.log(perfumes);
}

run();
