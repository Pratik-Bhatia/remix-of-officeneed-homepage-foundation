const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

const start = text.indexOf('    const answer = async (opt: string) => {');
const end = text.indexOf('  const restart = () => {', start);
if (start > -1 && end > -1) {
    text = text.slice(0, start) + text.slice(end);
    fs.writeFileSync(path, text);
    console.log("Removed duplicate answer function");
} else {
    console.log("Not found", start, end);
}
