const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /const RULES: Rule\[\] = \[\s*\{ category: "Fragrance Gifting", sub: "European Perfume", match: \/perfum\|fragranc\|eau de\|deodor\|cologne\/ \},\s*\{ category: "Fragrance Gifting", sub: "Middle Eastern Perfume", match: \/attar\|oud\|arab\|middle east\/ \},\s*\{ category: "Fragrance Gifting", sub: "Perfume Gift Sets", match: \/perfume gift set\|fragrance gift set\|perfume set\/ \},/,
  `const RULES: Rule[] = [
    { category: "Fragrance Gifting", sub: "Perfume Gift Sets", match: /perfume gift set|fragrance gift set|perfume set/ },
    { category: "Fragrance Gifting", sub: "Middle Eastern Perfume", match: /attar|oud|arab|middle east/ },
    { category: "Fragrance Gifting", sub: "European Perfume", match: /perfum|fragranc|eau de|deodor|cologne/ },`
);

fs.writeFileSync(path, content);
console.log("Fixed rules order in shopify-overlay.ts");
