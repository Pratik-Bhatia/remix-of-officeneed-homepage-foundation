const fs = require("fs");
const path = "src/components/officeneed/FragranceQuiz.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /m\.product\.images\?\.\[0\]\?\.url/g,
  'm.product.images?.[0]'
);

fs.writeFileSync(path, text);
console.log("Updated product image url logic");
