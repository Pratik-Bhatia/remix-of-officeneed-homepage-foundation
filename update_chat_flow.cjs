const fs = require("fs");
const path = "src/lib/chat-flow.ts";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /export type ChatStepId =[\s\S]*?\| "file";/,
  `export type ChatStepId =
  | "purpose"
  | "corporateOccasion"
  | "quantity"
  | "budget"
  | "timeline"
  | "refine"
  | "name"
  | "company"
  | "email"
  | "phone"
  | "message"
  | "file";`
);

text = text.replace(
  /export const chatSteps: ChatStep\[\] = \[[\s\S]*?\},\n  \{\n    id: "quantity"/,
  `export const chatSteps: ChatStep[] = [
  {
    id: "purpose",
    question: "What are you shopping for?",
    options: [
      "Corporate Gifting",
      "Fragrance Gifting",
      "Office Stationery",
      "Computer Peripherals",
    ],
  },
  {
    id: "corporateOccasion",
    question: "What is the occasion for the gift?",
    options: [
      "Employee Onboarding / Joining Kits",
      "Festive & Seasonal Gifting",
      "Client & Executive Appreciation",
      "Conferences & Corporate Events",
      "General Corporate Gifting"
    ],
  },
  {
    id: "quantity"`
);

text = text.replace(
  /const purposeToCategories: Record<string, ProductCategory\[\]> = \{[\s\S]*?\};/,
  `const purposeToCategories: Record<string, ProductCategory[]> = {
  "Corporate Gifting": ["Corporate Gifting"],
  "Fragrance Gifting": ["Fragrance Gifting"],
  "Office Stationery": ["Office Stationery"],
  "Computer Peripherals": ["Computer Peripherals"],
};`
);

fs.writeFileSync(path, text);
console.log("Updated chat-flow.ts");
