const fs = require("fs");
const path = "src/components/officeneed/FragranceQuiz.tsx";
let content = fs.readFileSync(path, "utf8");

content = content.replace(/"18-24", "25-34", "35-44"/g, '"18–24", "25–34", "35–44"');

fs.writeFileSync(path, content);
console.log("Updated en dashes in FragranceQuiz");
