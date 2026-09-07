const fs = require("fs");
const text = fs.readFileSync("src/components/officeneed/ChatWidget.tsx", "utf8");

let newText = text.replace(
  /if \(step\.id === "purpose" && clean === "Fragrance & Perfumes"\) \{[\s\S]*?if \(phase === "qualification"\) \{[\s\S]*?const nextIndex = stepIndex \+ 1;[\s\S]*?if \(nextIndex < chatSteps\.length\) \{/,
  `if (step.id === "purpose" && clean === "Fragrance Gifting") {
      setPhase("fragrance");
      return;
    }

    if (phase === "qualification") {
      let nextIndex = stepIndex + 1;
      if (step.id === "purpose" && clean !== "Corporate Gifting") {
        nextIndex = chatSteps.findIndex(s => s.id === "quantity");
      }
      if (nextIndex < chatSteps.length) {`
);

// We need to add session storage for the root category and corporate occasion!
// "Ensure sessionStorage captures the rootCategory and corporateOccasion parameters accurately."
// Where should we put this? In the answer function:

newText = newText.replace(
  /const next: ChatAnswers = \{ \.\.\.answers, \[step\.id\]: clean \};/,
  `const next: ChatAnswers = { ...answers, [step.id]: clean };
    if (step.id === "purpose") sessionStorage.setItem("rootCategory", clean);
    if (step.id === "corporateOccasion") sessionStorage.setItem("corporateOccasion", clean);`
);

fs.writeFileSync("src/components/officeneed/ChatWidget.tsx", newText);
console.log("Updated answer logic");
