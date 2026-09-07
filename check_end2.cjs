const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
const start = text.indexOf('step?.inputType === "file"');
console.log(text.slice(start + 1400, start + 1700));
