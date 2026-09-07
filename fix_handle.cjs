const fs = require("fs");
const path = "src/lib/taxonomy.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /"Office Stationery": \{\s*title: "Office Stationery",\s*id: "gid:\/\/shopify\/Collection\/498084806884",\s*handle: null,/,
  `"Office Stationery": {
    title: "Office Stationery",
    id: "gid://shopify/Collection/498084806884",
    handle: "office-stationary",`
);

fs.writeFileSync(path, content);
console.log("Updated Office Stationery handle.");
