const fs = require("fs");
const path = "src/components/officeneed/FragranceQuiz.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  'options={["1824", "2534", "3544", "45+", "Prefer not to say"]}',
  'options={["18-24", "25-34", "35-44", "45+", "Prefer not to say"]}'
);

fs.writeFileSync(path, text);
console.log("Fixed age group in FragranceQuiz");
