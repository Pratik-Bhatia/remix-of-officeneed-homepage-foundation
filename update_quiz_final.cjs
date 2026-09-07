const fs = require("fs");
const path = "src/components/officeneed/FragranceQuiz.tsx";
let text = fs.readFileSync(path, "utf8");

// Session storage state initialization
text = text.replace(
  /const \[step, setStep\] = useState<QuizStep>\("intro"\);/,
  `const [step, setStep] = useState<QuizStep>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).step || "intro"; } catch(e){}
    }
    return "intro";
  });`
);

text = text.replace(
  /const \[answers, setAnswers\] = useState<FragranceQuizAnswers>\(\{\}\);/,
  `const [answers, setAnswers] = useState<FragranceQuizAnswers>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).answers || {}; } catch(e){}
    }
    return {};
  });`
);

text = text.replace(
  /const \[selectedNotes, setSelectedNotes\] = useState<string\[\]>\(\[\]\);/,
  `const [selectedNotes, setSelectedNotes] = useState<string[]>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).answers?.notes || []; } catch(e){}
    }
    return [];
  });`
);

text = text.replace(
  /const \[selectedOccasion, setSelectedOccasion\] = useState<string\[\]>\(\[\]\);/,
  `const [selectedOccasion, setSelectedOccasion] = useState<string[]>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).answers?.occasion || []; } catch(e){}
    }
    return [];
  });`
);

// Session storage effect
if (!text.includes("sessionStorage.setItem('officeGpt_quizState'")) {
  text = text.replace(
    /useEffect\(\(\) => \{\n\s*if \(step === "results"\)/,
    `useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('officeGpt_quizState', JSON.stringify({ step, answers: { ...answers, notes: selectedNotes, occasion: selectedOccasion } }));
    }
  }, [step, answers, selectedNotes, selectedOccasion]);

  useEffect(() => {
    if (step === "results")`
  );
}

// Start Over resets session storage
text = text.replace(
  /const handleReset = \(\) => \{/,
  `const handleReset = () => {
    if (typeof window !== 'undefined') sessionStorage.removeItem('officeGpt_quizState');`
);
text = text.replace(
  /onClick=\{onReset\}/g,
  'onClick={() => { if (typeof window !== "undefined") sessionStorage.removeItem("officeGpt_quizState"); onReset(); }}'
);
text = text.replace(
  /onClick=\{\(\) => \{\n\s*setCurrentStepIndex\(0\);\n\s*setAnswers\(\{\}\);\n\s*setSelectedNotes\(\[\]\);\n\s*setSelectedOccasion\(\[\]\);\n\s*\}\}/g,
  'onClick={() => { if (typeof window !== "undefined") sessionStorage.removeItem("officeGpt_quizState"); onReset(); }}'
);

// Interaction states
// SingleChoice is-selected
text = text.replace(
  /value === opt\s*\n\s*\?\s*"border-primary bg-primary\/5 ring-1 ring-primary font-semibold text-primary"/,
  'value === opt \n                  ? "is-selected font-semibold text-primary"'
);
// Notes is-selected
text = text.replace(
  /selected \? "border-primary bg-primary\/5 ring-1 ring-primary" : "border-border hover:border-primary\/30 hover:bg-secondary"/g,
  'selected ? "is-selected" : "border-border hover:border-primary/30 hover:bg-secondary"'
);
// Occasion is-selected
text = text.replace(
  /selected \? "border-primary bg-primary\/5 ring-1 ring-primary" : "border-border hover:border-primary\/30"/g,
  'selected ? "is-selected" : "border-border hover:border-primary/30"'
);

// Badge and Subtitle Logic
const badgeRegex = /<div className="inline-flex items-center text-xs font-semibold px-2 py-1 bg-secondary rounded text-secondary-foreground">\s*\{m\.matchPercentage\}% Match\s*<\/div>/g;
text = text.replace(badgeRegex, `{m.matchPercentage >= 75 && (
                          <div className="inline-flex items-center text-xs font-semibold px-2 py-1 bg-secondary rounded text-secondary-foreground">
                            {m.matchPercentage}% Match
                          </div>
                        )}`);

const subtitleRegex = /<div className="bg-secondary\/50 p-3 rounded-xl mb-4 text-sm text-muted-foreground border border-secondary">\s*<p className="italic">"\{m\.explanation\}"<\/p>\s*<\/div>/g;
const newSubtitle = `<div className="bg-secondary/50 p-3 rounded-xl mb-4 text-sm text-muted-foreground border border-secondary">
                        <p className="italic">{m.product.fragranceProfile?.ai_subtitle || m.product.description.replace(/<[^>]*>?/gm, '').substring(0, 60) + (m.product.description.length > 60 ? '...' : '')}</p>
                      </div>`;
text = text.replace(subtitleRegex, newSubtitle);

fs.writeFileSync(path, text);
console.log("Updated FragranceQuiz logic effectively!");
