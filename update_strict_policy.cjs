const fs = require("fs");
const path = "src/components/officeneed/Footer.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /title: "Quality Assured",\s*description: "Carefully inspected & packed. Replacements provided for transit damage.",/g,
  'title: "No Returns or Exchanges",\n      description: "We do not offer returns, exchanges, or replacements under any circumstances.",'
);

fs.writeFileSync(path, text);
console.log("Updated Footer policy badges with strict no-return policy");
