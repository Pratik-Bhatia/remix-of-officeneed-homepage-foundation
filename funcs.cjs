const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
console.log(text.split("\n").filter(line => line.includes("const handle") || line.includes("function ")).join("\n"));
