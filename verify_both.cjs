const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");

// Verify icon
const iconMapIdx = text.indexOf("const iconMap:");
console.log("=== iconMap ===");
console.log(text.slice(iconMapIdx, iconMapIdx + 350));

// Verify branch
const branchIdx = text.indexOf('"Fragrance Gifting"');
console.log("\n=== Branch context ===");
console.log(text.slice(branchIdx - 50, branchIdx + 150));
