const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

if (!text.includes("ArrowLeft")) {
  text = text.replace(/import \{ Send, X/, "import { ArrowLeft, Send, X");
}

const handleBackFunc = `
  function handleBack() {
    if (phase === "qualification" && stepIndex > 0) {
      const isQuantityAndNotCorporate = stepIndex === chatSteps.findIndex(s => s.id === "quantity") && answers.purpose !== "Corporate Gifting";
      const nextIdx = isQuantityAndNotCorporate ? 0 : stepIndex - 1;
      setStepIndex(nextIdx);
      setMessages(m => m.slice(0, Math.max(1, m.length - 2)));
    }
  }
`;

text = text.replace(
  /function pushBot\(/,
  handleBackFunc + "\n  function pushBot("
);

const headerReplacement = `<div className="flex items-center gap-3">
              {phase === "qualification" && stepIndex > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mr-2 pr-3 border-r border-border"
                >
                  <ArrowLeft size={16} /> Back
                </button>
              )}
              <img src={logoUrl}`;

text = text.replace(
  /<div className="flex items-center gap-3">\s*<img src=\{logoUrl\}/,
  headerReplacement
);

fs.writeFileSync(path, text);
console.log("Added handleBack and back button");
