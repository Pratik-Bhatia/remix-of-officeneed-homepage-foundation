const fs = require("fs");
const text = fs.readFileSync("src/lib/enquiries.functions.ts", "utf8");
const start = text.indexOf('if (data.selectedProducts && data.selectedProducts.length > 0) {');
console.log(text.slice(start, start + 3000));
