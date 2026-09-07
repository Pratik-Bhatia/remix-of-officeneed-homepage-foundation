const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(/\},,/g, "},");

fs.writeFileSync(path, content);
console.log("Fixed trailing comma.");
