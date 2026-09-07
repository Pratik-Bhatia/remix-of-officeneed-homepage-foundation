const fs = require("fs");
const path = "src/lib/enquiries.functions.ts";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  "const subtotal = data.selectedProducts!.reduce((acc, p) => acc + (p.priceNum * p.quantity), 0);",
  "const subtotal = (data.selectedProducts || []).reduce((acc, p) => acc + (p.priceNum * p.quantity), 0);"
);

fs.writeFileSync(path, text);
console.log("Updated subtotal in enquiries.functions.ts");
