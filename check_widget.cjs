const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
console.log(text.split("\n").slice(675, 715).join("\n"));
