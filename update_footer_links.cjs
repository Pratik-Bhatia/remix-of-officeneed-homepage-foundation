const fs = require("fs");
const path = "src/components/officeneed/Footer.tsx";
let text = fs.readFileSync(path, "utf8");

const oldLinks = `const shopLinks = [
  "Shop All",
  "Bestsellers",
  "Corporate Gifting",
  "Office Stationery",
  "Computer Peripherals",
  "Fragrance & Luxury Gifting",
];`;

const newLinks = `const shopLinks = [
  "Corporate Gifting",
  "Office Stationery",
  "Computer Peripherals",
  "Fragrance Gifting",
];`;

text = text.replace(oldLinks, newLinks);

fs.writeFileSync(path, text);
console.log("Updated Footer shop links");
