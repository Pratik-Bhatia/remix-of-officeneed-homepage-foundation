const fs = require("fs");
const path = "src/lib/chat-flow.ts";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /id: "timeline",\s*question: "When do you need them\?",\s*options: \["This week", [^\]]+\]\s*,/g,
  `id: "timeline",
    question: "When do you need them?",
    options: ["This week", "1-2 weeks", "2-4 weeks", "Flexible"],
    disclaimer: "Delivery timelines for bulk or custom orders will be coordinated directly with you via email or message based on exact quantity and location.",`
);

fs.writeFileSync(path, text);
console.log("Timeline step updated.");
