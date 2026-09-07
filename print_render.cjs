const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
const returnStart = text.indexOf('return (');
console.log(text.slice(returnStart, returnStart + 2000));
