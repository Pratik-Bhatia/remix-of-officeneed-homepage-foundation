const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

const oldRule = `{ category: "Office Stationery", sub: "Notebooks & Notepads", match: /notebook|notepad|diary|register|journal/ },`;
const newRule = `{ category: "Hidden" as any, sub: "Hidden", match: /notebook|notepad|diary|register|journal|wiro book/ },`;

content = content.replace(oldRule, newRule);
fs.writeFileSync(path, content);
console.log("Updated notebook rule to Hidden.");
