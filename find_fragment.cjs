const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
console.log(text.indexOf("<>"));
console.log(text.slice(text.indexOf("<>") - 50, text.indexOf("<>") + 200));
