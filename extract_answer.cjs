const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
const match = text.match(/async function answer\([\s\S]*?(?=async function proceedEnquiry)/);
if (match) console.log(match[0]);
