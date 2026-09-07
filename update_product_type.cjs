const fs = require("fs");
const path = "src/lib/products.ts";
let text = fs.readFileSync(path, "utf8");

if (!text.includes('metafields?: Record<string, any>;')) {
  text = text.replace(
    'fragranceProfile?: any;',
    'fragranceProfile?: any;\n  metafields?: Record<string, any>;'
  );
  fs.writeFileSync(path, text);
  console.log("Updated Product type");
}
