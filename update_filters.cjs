const fs = require("fs");
const path = "src/lib/filters.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(/"Office Supplies": \[/g, '"Office Stationery": [');

fs.writeFileSync(path, content);
console.log("Updated filters.ts");
