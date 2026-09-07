const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
const start = text.indexOf('step?.options && step?.id !== "quantity"');
console.log(text.slice(start, start + 1000));
