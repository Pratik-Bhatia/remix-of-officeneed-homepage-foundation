const fs = require("fs");
const path = "src/components/officeneed/FragranceQuiz.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /"border-primary bg-primary\/5 ring-1 ring-primary font-semibold text-primary"/,
  '"is-selected font-semibold text-primary"'
);

fs.writeFileSync(path, text);
console.log("Updated SingleChoice is-selected logic!");
