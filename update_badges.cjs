const fs = require("fs");
const path = "src/components/officeneed/Footer.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /title: "No Returns and Exchanges",\s*description: "All products are non-returnable and non-exchangeable.",/g,
  'title: "Quality Assured",\n    description: "Carefully inspected & packed. Replacements provided for transit damage.",'
);

text = text.replace(
  /title: "No Cash on Delivery",\s*description: "Cash on Delivery \(COD\) is not available. We accept online payments only.",/g,
  'title: "100% Secure Payments",\n    description: "Encrypted online checkout via UPI, Cards, and Net Banking.",'
);

fs.writeFileSync(path, text);
console.log("Updated Footer policy badges");
