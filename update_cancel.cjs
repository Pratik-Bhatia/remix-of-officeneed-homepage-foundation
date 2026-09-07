const fs = require("fs");
const path = "src/routes/cancellation-policy.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /Please note that all products are non-returnable and non-exchangeable\./g,
  "Please note that all products are strictly non-returnable and non-exchangeable, and we have a strict no replacement policy under any circumstances."
);

fs.writeFileSync(path, text);
console.log("Updated cancellation policy");
