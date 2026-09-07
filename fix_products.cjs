const fs = require("fs");
const path = "src/lib/chat-flow.ts";
let text = fs.readFileSync(path, "utf8");

// Add disclaimer type
text = text.replace(
  /optional\?: boolean;\n\};/,
  `optional?: boolean;\n  disclaimer?: string;\n};`
);

// Update timeline step
text = text.replace(
  /id: "timeline",\n\s*question: "When do you need them\?",\n\s*options: \["This week", "1–2 weeks", "2–4 weeks", "Flexible"\],/,
  `id: "timeline",
    question: "When do you need them?",
    options: ["This week", "1–2 weeks", "2–4 weeks", "Flexible"],
    disclaimer: "Delivery timelines for bulk or custom orders will be coordinated directly with you via email or message based on exact quantity and location.",`
);

// Update recommendProducts to take catalogue argument
text = text.replace(
  /export function recommendProducts\(answers: ChatAnswers, refinement\?: string, limit = 4\): Product\[\] \{/,
  `export function recommendProducts(catalogue: Product[], answers: ChatAnswers, refinement?: string, limit = 4): Product[] {`
);

// Update recommendProducts to map catalogue
text = text.replace(
  /const scored = products\.map\(\(product\) => \{/,
  `const scored = catalogue.map((product) => {`
);

fs.writeFileSync(path, text);
console.log("Updated chat-flow.ts");
