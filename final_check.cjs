const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");

const checks = [
  ["answer() function exists",       text.includes("async function answer(value: string)")],
  ["Fragrance Gifting branch",       text.includes('step.id === "purpose" && clean === "Fragrance Gifting"')],
  ["setPhase fragrance",             text.includes('setPhase("fragrance")')],
  ["qualification flow intact",      text.includes("setPhase(\"refinement\")")],
  ["enquiry flow intact",            text.includes("await proceedEnquiry(next)")],
  ["Fragrance Gifting icon",         text.includes('"Fragrance Gifting": Sparkles')],
  ["FragranceQuiz imported",         text.includes("import { FragranceQuiz }")],
  ["FragranceQuiz rendered",         text.includes("<FragranceQuiz")],
  ["Icon render guard exists",       text.includes("{Icon &&")],
];

checks.forEach(([label, ok]) => console.log((ok ? "?" : "?") + " " + label));
