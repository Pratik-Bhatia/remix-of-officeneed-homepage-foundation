const fs = require("fs");
const lines = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8").split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("function proceedEnquiry") || lines[i].includes("function answer") || lines[i].includes("const answer =") || lines[i].includes("const restart =") || lines[i].includes("function finish")) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
    }
}
