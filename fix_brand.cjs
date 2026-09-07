const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /\.\.\.\(node\.vendor \? \{ specifications: \[\{ label: "Brand", value: node\.vendor \}\] \} : \{\}\),\s*/g,
  ""
);

fs.writeFileSync(path, content);
console.log("Removed hardcoded Brand specification.");
