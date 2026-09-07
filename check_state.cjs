const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");

// 1. Check the iconMap
const iconMapIdx = text.indexOf("const iconMap:");
console.log("=== iconMap ===");
console.log(text.slice(iconMapIdx, iconMapIdx + 400));

// 2. Check if FragranceQuiz is imported
console.log("\n=== Import ===");
console.log(text.includes("import { FragranceQuiz }") ? "FragranceQuiz IS imported" : "FragranceQuiz NOT imported");

// 3. Check if the fragrance branch exists in answer()
console.log("\n=== Branch ===");
console.log(text.includes('"Fragrance Gifting"') ? "Fragrance Gifting branch EXISTS" : "Fragrance Gifting branch MISSING");

// 4. Check if phase has fragrance
console.log("\n=== Phase type ===");
console.log(text.includes('"fragrance"') ? "fragrance phase EXISTS" : "fragrance phase MISSING");

// 5. Check if icon rendering has Guard
console.log("\n=== Icon render ===");
const iconRenderIdx = text.indexOf("{Icon &&");
console.log(iconRenderIdx > -1 ? "Icon render guard EXISTS" : "Icon render guard MISSING (Icon renders unconditionally)");
