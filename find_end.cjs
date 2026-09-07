const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");
const start = text.indexOf('async function finish(final: ChatAnswers) {');
console.log(text.slice(start + 1500, start + 2500));
