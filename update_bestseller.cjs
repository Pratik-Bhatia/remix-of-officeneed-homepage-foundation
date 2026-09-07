const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(/p\.category === "Office Supplies"/g, 'p.category === "Office Stationery"');

fs.writeFileSync(path, content);
console.log("Updated shopify-overlay.ts mapping.");
