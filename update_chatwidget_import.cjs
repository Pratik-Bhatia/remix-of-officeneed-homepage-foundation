const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

if (!text.includes("import { FragranceQuiz }")) {
    text = text.replace(
      'import { AiAssistantIcon } from "@/components/officeneed/AiAssistantIcon";',
      'import { AiAssistantIcon } from "@/components/officeneed/AiAssistantIcon";\nimport { FragranceQuiz } from "./FragranceQuiz";'
    );
}

text = text.replace(
  'const [phase, setPhase] = useState<"qualification" | "refinement" | "enquiry" | "done">("qualification");',
  'const [phase, setPhase] = useState<"qualification" | "refinement" | "enquiry" | "done" | "fragrance">("qualification");'
);

fs.writeFileSync(path, text);
console.log("Updated ChatWidget.tsx imports and phase");
