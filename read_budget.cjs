const fs = require("fs");
const text = fs.readFileSync("src/lib/chat-flow.ts", "utf8");
const start = text.indexOf('id: "budget"');
console.log(text.slice(start, start + 200));
