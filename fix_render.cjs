const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

if (!text.includes("import { FragranceQuiz }")) {
  text = text.replace(
    'import { AiAssistantIcon } from "@/components/officeneed/AiAssistantIcon";',
    'import { AiAssistantIcon } from "@/components/officeneed/AiAssistantIcon";\nimport { FragranceQuiz } from "./FragranceQuiz";'
  );
}

if (!text.includes("<FragranceQuiz")) {
  text = text.replace(
    '<div className="flex-1 overflow-hidden relative">',
    `      {phase === "fragrance" && (
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
      <div className={cn("flex-1 overflow-hidden relative", phase === "fragrance" ? "hidden" : "block")}>`
  );
}

fs.writeFileSync(path, text);
console.log("Fixed rendering via file script");
