const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
console.log(text.split("\n").map((line, i) => `${i}: ${line}`).filter(line => line.toLowerCase().includes("back")).join("\n"));
