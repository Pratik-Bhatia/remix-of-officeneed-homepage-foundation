const fs = require("fs");
const path = "src/lib/enquiries.functions.ts";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  "if (data.selectedProducts && data.selectedProducts.length > 0) {",
  "if (true) {"
);

fs.writeFileSync(path, text);
console.log("Updated enquiries.functions.ts");
