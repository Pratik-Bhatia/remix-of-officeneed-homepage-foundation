const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
console.log(text.slice(text.indexOf("return ("), text.indexOf("return (") + 2000));
