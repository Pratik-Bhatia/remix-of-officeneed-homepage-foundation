const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

const start = text.indexOf('const answer = async (opt: string) => {');
const end = text.indexOf('const restart = () => {'); // Wait, earlier I replaced UP TO restart
if (start > -1) {
    // Actually let's just delete the const answer function block
    const nextFunc = text.indexOf('const restart = () => {', start);
    if (nextFunc > -1) {
        text = text.slice(0, start) + text.slice(nextFunc);
        fs.writeFileSync(path, text);
        console.log("Removed duplicate answer function");
    }
}
