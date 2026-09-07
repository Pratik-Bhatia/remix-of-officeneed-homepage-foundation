const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
const start = text.indexOf('async function answer');
console.log(text.slice(start - 200, start + 300));
const second = text.indexOf('const answer = async');
console.log("\n--- SECOND: ---\n");
console.log(text.slice(second - 200, second + 300));
