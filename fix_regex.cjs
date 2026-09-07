const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /const headerRegex = \/<\(h\[2-6\]\|b\|strong\)\[\^>\]\*>\\s\*\(\.\*\?\\)\[\\s:;<\]\*\\s\*<\\\/\\1>\/gi;/,
  "const headerRegex = /<(h[2-6]|b|strong)[^>]*>(?:\\s*<[a-z]+[^>]*>)*\\s*(Product Features|Key Features|Features|Specifications|Fragrance Notes|Product Details|Material|Dimensions|Compatibility|What\\'s Included)[\\s:;<]*(?:<\\/[a-z]+>\\s*)*<\\/\\1>/gi;"
);

// Actually, I'll just use a safer string replace since regexes can be tricky to escape
const oldRegex = `const headerRegex = /<(h[2-6]|b|strong)[^>]*>\\s*(Product Features|Key Features|Features|Specifications|Fragrance Notes|Product Details|Material|Dimensions|Compatibility|What's Included)[\\s:;<]*\\s*<\\/\\1>/gi;`;
const newRegex = `const headerRegex = /<(h[2-6]|b|strong)[^>]*>(?:\\s*<[^>]+>)*\\s*(Product Features|Key Features|Features|Specifications|Fragrance Notes|Product Details|Material|Dimensions|Compatibility|What's Included)[\\s:;<]*(?:<\\/[^>]+>\\s*)*<\\/\\1>/gi;`;

content = content.replace(oldRegex, newRegex);

fs.writeFileSync(path, content);
console.log("Updated headerRegex to allow nested tags like spans.");
