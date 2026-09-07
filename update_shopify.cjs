const fs = require("fs");
const path = "src/lib/shopify.ts";
let content = fs.readFileSync(path, "utf8");

const oldProductFields = `options { name values }
  collections(first: 50) { edges { node { handle } } }
\`;`;

const newProductFields = `options { name values }
  collections(first: 50) { edges { node { handle } } }
  metafields(identifiers: [
    {namespace: "fragrance", key: "notes"},
    {namespace: "fragrance", key: "occasion"},
    {namespace: "fragrance", key: "personality"},
    {namespace: "fragrance", key: "mood"},
    {namespace: "fragrance", key: "intensity"},
    {namespace: "fragrance", key: "weather"},
    {namespace: "fragrance", key: "time_of_day"},
    {namespace: "fragrance", key: "recipient"},
    {namespace: "fragrance", key: "age_group"},
    {namespace: "fragrance", key: "corporate"},
    {namespace: "fragrance", key: "gift_suitable"}
  ]) {
    key
    value
    type
  }
\`;`;

content = content.replace(oldProductFields, newProductFields);

// Also add it to the interface
content = content.replace(
  `collections?: { edges: Array<{ node: { handle: string } }> };`,
  `collections?: { edges: Array<{ node: { handle: string } }> };
  metafields?: Array<{ key: string; value: string; type: string } | null> | null;`
);

fs.writeFileSync(path, content);
console.log("Updated shopify.ts");
