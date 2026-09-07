const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /"Fragrance Gifting": Droplets,/,
  '"Fragrance & Perfumes": Droplets,'
);

// We also added `import { FragranceQuiz } from "./FragranceQuiz";` but the correct path is inside the same folder so `./FragranceQuiz` is correct.

fs.writeFileSync(path, content);
console.log("Updated ChatWidget icon mapping");
