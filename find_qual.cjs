const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
// Find the qualification branch
const idx = text.indexOf(`if (phase === "qualification")`);
console.log(text.slice(idx, idx + 400));
