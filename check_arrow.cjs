const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
const start = text.indexOf('lucide-react');
console.log(text.slice(start - 200, start + 100));
