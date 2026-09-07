const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

const oldRegex = `const headerRegex = /<(h[2-6]|b|strong)[^>]*>\\s*(Product Features|Key Features|Features|Specifications|Fragrance Notes|Product Details|Material|Dimensions|Compatibility|What's Included)[\\s:;<]*\\s*<\\/\\1>/gi;`;
const newRegex = `const headerRegex = /<(h[2-6]|b|strong)[^>]*>(?:\\s*<[^>]+>)*\\s*(Product Features|Key Features|Features|Specifications|Fragrance Notes|Product Details|Material|Dimensions|Compatibility|What\\'s Included)[\\s:;<]*(?:<\\/[^>]+>\\s*)*<\\/\\1>/gi;`;

content = content.replace(oldRegex, newRegex);

fs.writeFileSync(path, content);
console.log("Updated headerRegex successfully.");
