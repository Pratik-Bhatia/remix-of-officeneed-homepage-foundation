const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
const start = text.indexOf(') : step?.id === "purpose" && step.options ? (');
console.log(text.slice(start - 200, start + 800));
