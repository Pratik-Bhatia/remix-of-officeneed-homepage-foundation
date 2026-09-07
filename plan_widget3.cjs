const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let content = fs.readFileSync(path, "utf8");

// Branching logic for the first question
// When the user answers "purpose", if it's "Fragrance & Perfumes", open the quiz!
content = content.replace(
  'const [phase, setPhase] = useState<"qualification" | "refinement" | "enquiry" | "done">("qualification");',
  'const [phase, setPhase] = useState<"qualification" | "refinement" | "enquiry" | "done" | "fragrance">("qualification");'
);

content = content.replace(
  'setAnswers((prev) => ({ ...prev, [step.id]: value }));',
  `setAnswers((prev) => ({ ...prev, [step.id]: value }));
      if (step.id === "purpose" && value === "Fragrance & Perfumes") {
        setPhase("fragrance");
        return;
      }`
);

// We need to render FragranceQuiz when phase === "fragrance"
const renderQuizCode = `
      {phase === "fragrance" && (
        <FragranceQuiz 
          products={shopifyProducts} 
          onClose={() => setOpen(false)} 
          onReset={() => {
            setPhase("qualification");
            setAnswers({});
            setStepIndex(0);
          }} 
        />
      )}
`;

content = content.replace(
  '<div className="flex-1 overflow-hidden relative">',
  `${renderQuizCode}\n      <div className={cn("flex-1 overflow-hidden relative", phase === "fragrance" ? "hidden" : "block")}>`
);

fs.writeFileSync(path, content);
console.log("Updated ChatWidget to open FragranceQuiz");
