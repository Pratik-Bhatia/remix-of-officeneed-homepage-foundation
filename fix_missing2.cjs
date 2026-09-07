const fs = require("fs");
const path = "src/routes/products.index.tsx";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /\{missingMapping \? \([\s\S]*?\) : visible\.length === 0 \? \(/,
  "{visible.length === 0 ? ("
);

fs.writeFileSync(path, content);
console.log("Fixed missingMapping UI block via regex.");
