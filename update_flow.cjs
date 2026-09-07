const fs = require("fs");
const path = "src/lib/chat-flow.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /"Fragrance Gifting"/,
  '"Fragrance & Perfumes"'
);

fs.writeFileSync(path, content);
console.log("Updated chat-flow.ts");
