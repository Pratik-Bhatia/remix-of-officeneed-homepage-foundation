const fs = require("fs");
const path = "src/components/officeneed/FragranceQuiz.tsx";
let text = fs.readFileSync(path, "utf8");

// 1. Session Storage Logic
if (!text.includes("sessionStorage.getItem('officeGpt_quizState')")) {
  text = text.replace(
    'const [step, setStep] = useState<QuizStep>("intro");',
    `const [step, setStep] = useState<QuizStep>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).step || "intro"; } catch(e){}
    }
    return "intro";
  });`
  );
  
  text = text.replace(
    'const [answers, setAnswers] = useState<FragranceQuizAnswers>({});',
    `const [answers, setAnswers] = useState<FragranceQuizAnswers>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).answers || {}; } catch(e){}
    }
    return {};
  });`
  );
  
  text = text.replace(
    'const [selectedNotes, setSelectedNotes] = useState<string[]>([]);',
    `const [selectedNotes, setSelectedNotes] = useState<string[]>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).answers?.notes || []; } catch(e){}
    }
    return [];
  });`
  );
  
  text = text.replace(
    'const [selectedOccasion, setSelectedOccasion] = useState<string[]>([]);',
    `const [selectedOccasion, setSelectedOccasion] = useState<string[]>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).answers?.occasion || []; } catch(e){}
    }
    return [];
  });`
  );

  text = text.replace(
    'useEffect(() => {',
    `useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('officeGpt_quizState', JSON.stringify({ step, answers: { ...answers, notes: selectedNotes, occasion: selectedOccasion } }));
    }
  }, [step, answers, selectedNotes, selectedOccasion]);

  useEffect(() => {`
  );
}

// Start over should clear session storage
text = text.replace(
  'const handleReset = () => {',
  `const handleReset = () => {
    if (typeof window !== 'undefined') sessionStorage.removeItem('officeGpt_quizState');`
);
text = text.replace(
  'onClick={onReset}',
  'onClick={() => { if (typeof window !== "undefined") sessionStorage.removeItem("officeGpt_quizState"); onReset(); }}'
);

// 2. Interaction States (is-selected)
// For SingleChoice
text = text.replace(
  'value === opt \n                  ? "border-primary bg-primary/5 ring-1 ring-primary font-semibold text-primary" \n                  : opt === "Not Sure"',
  'value === opt \n                  ? "is-selected font-semibold text-primary" \n                  : opt === "Not Sure"'
);

// For Notes
text = text.replace(
  'selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/30 hover:bg-secondary"',
  'selected ? "is-selected" : "border-border hover:border-primary/30 hover:bg-secondary"'
);

// For Occasion
text = text.replace(
  'selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/30"',
  'selected ? "is-selected" : "border-border hover:border-primary/30"'
);

// 3. Recommendation Match Logic
// Subtitle logic
const subtitleRegex = /<p className="text-sm text-muted-foreground mt-1 line-clamp-2">[\s\S]*?<\/p>/g;
const subtitleReplacement = `<p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {m.product.fragranceProfile?.ai_subtitle || m.product.description.replace(/<[^>]*>?/gm, '').substring(0, 60) + (m.product.description.length > 60 ? '...' : '')}
                    </p>`;
text = text.replace(subtitleRegex, subtitleReplacement);

// Score threshold logic
// Find the badge: {m.matchPercentage}% Match
const badgeRegex = /<div className="flex items-center gap-1 font-bold text-sm bg-primary\/10 text-primary px-2 py-0\.5 rounded-md">\s*<Sparkles size=\{14\} \/>\s*\{m\.matchPercentage\}% Match\s*<\/div>/g;
const badgeReplacement = `{m.matchPercentage >= 75 && (
                      <div className="flex items-center gap-1 font-bold text-sm bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                        <Sparkles size={14} /> {m.matchPercentage}% Match
                      </div>
                    )}`;
text = text.replace(badgeRegex, badgeReplacement);

fs.writeFileSync(path, text);
console.log("Updated FragranceQuiz logic!");
