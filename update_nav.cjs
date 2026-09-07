const fs = require("fs");
const path = "src/lib/navigation.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /"Exclusive Products", "Featured Exclusives", "New Exclusives"/,
  '"Featured Exclusives", "New Exclusives"'
);

fs.writeFileSync(path, content);
console.log("Updated navigation.ts");
