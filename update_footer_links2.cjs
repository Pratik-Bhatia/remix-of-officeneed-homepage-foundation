const fs = require("fs");
const path = "src/components/officeneed/Footer.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /const shopLinks = \[[^\]]+\];/,
  `const shopLinks = [
  "Corporate Gifting",
  "Office Stationery",
  "Computer Peripherals",
  "Fragrance Gifting",
];`
);

fs.writeFileSync(path, text);
console.log("Updated Footer shop links via regex");
