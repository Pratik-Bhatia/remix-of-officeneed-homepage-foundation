const fs = require("fs");
let content = fs.readFileSync("src/lib/taxonomy.ts", "utf8");

// Add Premium Gifts under Fragrance Gifting
const fragRegex = /"Fragrance Gifting": \{[\s\S]*?subcategories: \{/;
content = content.replace(fragRegex, `$&
      "Premium Gifts": { title: "Premium Gifts", id: null, handle: "premium-gifts" },`);

fs.writeFileSync("src/lib/taxonomy.ts", content);
console.log("Added Premium Gifts to Fragrance Gifting in taxonomy.");
