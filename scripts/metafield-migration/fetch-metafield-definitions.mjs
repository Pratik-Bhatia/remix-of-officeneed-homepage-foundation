#!/usr/bin/env node
/**
 * READ-ONLY: fetches the real Shopify metafield definitions for the 7
 * product-owned fields this migration uses, and reports their actual type.
 * No assumptions, no writes.
 */
import { fetchMetafieldDefinitions } from "./shopify-client.mjs";

const EXPECTED_FIELDS = [
  "product_common.brand",
  "product_common.product_type",
  "product_common.dimensions",
  "product_stationery.pages",
  "product_stationery.paper_weight",
  "product_stationery.ruling",
  "product_stationery.binding",
];

async function main() {
  console.log("Fetching real Shopify metafield definitions (READ-ONLY, ownerType: PRODUCT)...\n");
  const defs = await fetchMetafieldDefinitions();
  const byKey = new Map(defs.map((d) => [`${d.namespace}.${d.key}`, d]));

  let missing = 0;
  for (const field of EXPECTED_FIELDS) {
    const def = byKey.get(field);
    if (!def) {
      console.log(`  ${field.padEnd(32)} MISSING -- no definition found on Shopify`);
      missing++;
    } else {
      console.log(`  ${field.padEnd(32)} type = ${def.type.name}   (name: "${def.name}")`);
    }
  }

  console.log(`\nTotal product metafield definitions on the store: ${defs.length}`);
  console.log(missing === 0 ? "\nAll 7 required fields have a real definition -- no guessing needed." : `\n${missing} field(s) missing a definition -- STOP, do not write these until resolved.`);
  if (missing > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
