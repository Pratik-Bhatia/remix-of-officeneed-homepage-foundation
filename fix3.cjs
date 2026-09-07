const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

const importSearch = 'import { AiAssistantIcon } from "@/components/officeneed/AiAssistantIcon";';
if (!text.includes('import { FragranceQuiz }')) {
  text = text.replace(importSearch, importSearch + '\nimport { FragranceQuiz } from "./FragranceQuiz";');
}

const headerSearch = '{/* Header */}';
const quizBlock = `      {phase === "fragrance" && (
        <FragranceQuiz 
          products={shopifyProducts} 
          onClose={() => setOpen(false)} 
          onReset={() => {
            setPhase("qualification");
            setAnswers({});
            setStepIndex(0);
          }} 
        />
      )}`;

if (!text.includes('<FragranceQuiz')) {
  text = text.replace(headerSearch, quizBlock + '\n          ' + headerSearch);
}

fs.writeFileSync(path, text);
console.log("Injected render block!");
