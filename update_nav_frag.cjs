const fs = require("fs");
let content = fs.readFileSync("src/lib/navigation.ts", "utf8");

const oldFragranceNav = /id: "fragrance-luxury",[\s\S]*?items: \[[\s\S]*?\],/m;
const newFragranceNav = `id: "fragrance-luxury",
    label: "Fragrance Gifting",
    blurb: "Considered luxury for leadership and landmark occasions.",
    items: [
      "European Perfume",
      "Middle Eastern Perfume",
      "Perfume Gift Sets",
    ],`;

content = content.replace(oldFragranceNav, newFragranceNav);
fs.writeFileSync("src/lib/navigation.ts", content);
console.log("Updated Fragrance Gifting in navigation.");
