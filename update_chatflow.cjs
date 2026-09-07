const fs = require("fs");
const path = "src/lib/chat-flow.ts";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  `    options: [
      "Corporate Gifting",
      "Fragrance Gifting",
      "Office Stationery",
      "Computer Peripherals",
    ],`,
  `    options: [
      "Corporate Gifting",
      "Fragrance Gifting",
    ],`
);

fs.writeFileSync(path, text);
console.log("Updated chat-flow.ts");
