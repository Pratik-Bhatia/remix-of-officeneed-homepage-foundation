const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
console.log(text.includes("Back") || text.includes("ArrowLeft") ? "Has Back button" : "No Back button found");
