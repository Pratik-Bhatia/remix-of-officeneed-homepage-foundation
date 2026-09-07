const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let content = fs.readFileSync(path, "utf8");

const oldCode = `      const next: ChatAnswers = { ...answers, [step.id]: clean };
      setAnswers(next);
      setDraft("");
      setMessages((m) => [...m, { id: uid(), role: "user", text: clean || "Skip" }]);

      if (phase === "qualification") {`;

const newCode = `      const next: ChatAnswers = { ...answers, [step.id]: clean };
      setAnswers(next);
      setDraft("");
      setMessages((m) => [...m, { id: uid(), role: "user", text: clean || "Skip" }]);

      if (step.id === "purpose" && clean === "Fragrance & Perfumes") {
        setPhase("fragrance");
        return;
      }

      if (phase === "qualification") {`;

content = content.replace(oldCode, newCode);

fs.writeFileSync(path, content);
console.log("Fixed ChatWidget branching logic");
