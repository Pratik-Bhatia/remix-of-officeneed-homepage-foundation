const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
const branchIdx = text.indexOf('step.id === "purpose" && clean === "Fragrance Gifting"');
console.log(branchIdx > -1 ? "BRANCH CONFIRMED" : "BRANCH MISSING");
if (branchIdx > -1) console.log(text.slice(branchIdx - 40, branchIdx + 120));
