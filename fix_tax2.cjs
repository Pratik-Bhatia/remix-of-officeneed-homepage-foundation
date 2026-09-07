const fs = require("fs");
const path = "src/lib/taxonomy.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /"Mobile Accessories": \{ title: "Mobile Accessories", id: null, handle: null \},\s*"Power & Charging": \{ title: "Power & Charging", id: null, handle: null \},\s*"Networking Accessories": \{ title: "Networking Accessories", id: null, handle: null \},\s*/g,
  ""
);

fs.writeFileSync(path, content);
console.log("Removed unused subcategories with regex.");
