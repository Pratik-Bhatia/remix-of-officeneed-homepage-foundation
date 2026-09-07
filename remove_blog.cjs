const fs = require("fs");
const path = "src/components/officeneed/Footer.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /\s*\{\s*label:\s*"Blog & Insights",\s*href:\s*"\/blog"\s*\},/g,
  ""
);

fs.writeFileSync(path, text);
console.log("Removed Blog & Insights from Quick Links");
