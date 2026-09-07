const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

// Find the start of the answer function
const FUNC_START = "  async function answer(value: string) {";
const FUNC_END   = "  async function proceedEnquiry(next: ChatAnswers) {";

const startIdx = text.indexOf(FUNC_START);
const endIdx   = text.indexOf(FUNC_END);

if (startIdx === -1 || endIdx === -1) {
  console.error("Could not find boundaries:", { startIdx, endIdx });
  process.exit(1);
}

const CORRECT_ANSWER_FN = `  async function answer(value: string) {
    if (!step || typing) return;
    const clean = value.trim();
    if (!clean && !step.optional) return;
    
    if (step.inputType === "email" && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(clean)) {
      setMessages((m) => [
        ...m,
        { id: uid(), role: "user", text: clean },
        { id: uid(), role: "bot", text: "That email doesn't look quite right. Please enter a valid email address so I can send your enquiry confirmation." },
      ]);
      setDraft("");
      return;
    }

    if (step.inputType === "tel") {
      let digits = clean.replace(/\\D/g, "");
      if (digits.startsWith("91") && digits.length === 12) {
        digits = digits.slice(2);
      }
      if (digits.length !== 10 || !/^[6-9]\\d{9}$/.test(digits)) {
        setMessages((m) => [
          ...m,
          { id: uid(), role: "user", text: clean },
          { id: uid(), role: "bot", text: "That phone number doesn't look correct. Please enter a valid 10-digit mobile number." },
        ]);
        setDraft("");
        return;
      }
    }

    const next: ChatAnswers = { ...answers, [step.id]: clean };
    setAnswers(next);
    setDraft("");
    setMessages((m) => [...m, { id: uid(), role: "user", text: clean || "Skip" }]);

    if (phase === "qualification") {
      if (step.id === "purpose" && clean === "Fragrance Gifting") {
        setPhase("fragrance");
        return;
      }
      const nextIndex = stepIndex + 1;
      if (nextIndex < chatSteps.length) {
        setStepIndex(nextIndex);
        pushBot(chatSteps[nextIndex]!.question, 500);
      } else {
        // We finished qualification — show recommendations
        setPhase("refinement");
        const picks = recommendProducts(next);
        setCurrentRecommendations(picks);
        pushBot("Based on what you've told me, here are a few options I'd recommend.", 800, picks, true);
        pushBot(refineStep.question, 1800);
      }
    } else if (phase === "refinement") {
      if (clean === "Start Over") {
         restart();
      } else if (clean === "Prepare Enquiry") {
         setPhase("enquiry");
         setStepIndex(0);
         pushBot(enquirySteps[0]!.question, 600);
      } else {
         // Show Premium / Show Budget
         const picks = recommendProducts(next, clean);
         setCurrentRecommendations(picks);
         pushBot(\`Here are some options based on your preference for "\${clean}":\`, 800, picks, true);
         pushBot(refineStep.question, 1800);
      }
    } else if (phase === "enquiry") {
      await proceedEnquiry(next);
    }
  }

`;

const before = text.slice(0, startIdx);
const after  = text.slice(endIdx);
text = before + CORRECT_ANSWER_FN + after;
fs.writeFileSync(path, text);
console.log("answer() function fully restored.");
