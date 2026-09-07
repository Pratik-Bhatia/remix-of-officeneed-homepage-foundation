const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

const branchingLogic = `    if (phase === "qualification") {
      const nextIndex = stepIndex + 1;
      if (step.id === "purpose" && clean === "Fragrance Gifting") {
        setPhase("fragrance");
        return;
      }
      if (nextIndex < chatSteps.length) {`;

text = text.replace(
  `    if (phase === "qualification") {
      const nextIndex = stepIndex + 1;
      if (nextIndex < chatSteps.length) {`,
  branchingLogic
);

fs.writeFileSync(path, text);
console.log("Updated ChatWidget.tsx answer branch");
