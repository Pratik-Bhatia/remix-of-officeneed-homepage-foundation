const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
console.log(text.slice(text.indexOf("<div className=\"flex items-center justify-between gap-3 border-b"), text.indexOf("<div className=\"flex items-center justify-between gap-3 border-b") + 1000));
