const fs = require("fs");
let content = fs.readFileSync("src/lib/taxonomy.ts", "utf8");

const oldFragrance = /"Fragrance Gifting": \{[\s\S]*?"Office Stationery": \{/;
const newFragrance = `"Fragrance Gifting": {
    title: "Fragrance Gifting",
    id: "gid://shopify/Collection/498084937956",
    handle: "fragrance-gifting",
    subcategories: {
      "European Perfume": { title: "European Perfume", id: null, handle: "european-perfume" },
      "Middle Eastern Perfume": { title: "Middle Eastern Perfume", id: null, handle: "middle-eastern-perfume" },
      "Perfume Gift Sets": { title: "Perfume Gift Sets", id: null, handle: "perfume-gift-sets" }
    }
  },
  "Office Stationery": {`;

content = content.replace(oldFragrance, newFragrance);
fs.writeFileSync("src/lib/taxonomy.ts", content);
console.log("Updated Fragrance Gifting in taxonomy.");
