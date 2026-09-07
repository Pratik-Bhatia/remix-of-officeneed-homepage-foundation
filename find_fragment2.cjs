const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
const first = text.indexOf("<>");
const second = text.indexOf("<>", first + 1);
console.log(text.slice(second - 50, second + 200));
