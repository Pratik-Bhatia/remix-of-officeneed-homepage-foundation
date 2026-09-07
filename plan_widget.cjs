const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let content = fs.readFileSync(path, "utf8");

// 1. Rename "Fragrance Gifting" to "Fragrance & Perfumes" inside chatSteps is handled in chat-flow.ts.
// But we need to check if ChatWidget imports FragranceQuiz
if (!content.includes("FragranceQuiz")) {
  content = content.replace(
    'import { AiAssistantIcon } from "@/components/officeneed/AiAssistantIcon";',
    'import { AiAssistantIcon } from "@/components/officeneed/AiAssistantIcon";\nimport { FragranceQuiz } from "./FragranceQuiz";\nimport { FlaskConical } from "lucide-react";'
  );
}

// 2. Add fragrance quiz state
if (!content.includes("showFragranceQuiz")) {
  content = content.replace(
    'const [open, setOpen] = useState(false);',
    'const [open, setOpen] = useState(false);\n  const [showFragranceQuiz, setShowFragranceQuiz] = useState(false);'
  );
}

// 3. Render it
const renderQuizCode = `
      {showFragranceQuiz && (
        <FragranceQuiz 
          products={Array.from(selectedProductSlugs).map(slug => currentRecommendations.find(p => p.slug === slug)).filter(Boolean) as any} 
          onClose={() => { setShowFragranceQuiz(false); setOpen(false); }} 
          onReset={() => { setShowFragranceQuiz(false); restart(); }} 
        />
      )}
`;

// But wait, the products passed to the quiz should be the entire catalogue or filtered ones? 
// The quiz component expects products. Let's pass the catalogue!
// The catalogue is returned by \`useShopifyCatalogue([])\` which might be in the parent, or we can use the products array in ChatWidget if it exists, or just import it.
// Actually, ChatWidget receives \`products\` from the route, but wait, ChatWidget doesn't take props right now.
// Wait! Let's look at ChatWidget props or hooks.
