import { useState, useEffect } from "react";
import { ArrowLeft, Check, Sparkles, ChevronRight, X, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FragranceQuizAnswers, FragranceMatch } from "@/lib/fragrance-engine";
import { getFragranceRecommendations } from "@/lib/fragrance-engine";
import type { Product } from "@/lib/products";
import aquaticIcon from "@/assets/fragrance/Aquatic.svg";
import floralIcon from "@/assets/fragrance/flower.svg";
import freshIcon from "@/assets/fragrance/Fresh.svg";
import fruityIcon from "@/assets/fragrance/Fruity.svg";
import citrusIcon from "@/assets/fragrance/lemon.svg";
import muskyIcon from "@/assets/fragrance/Musky.svg";
import oudIcon from "@/assets/fragrance/oud.svg";
import spicyIcon from "@/assets/fragrance/spicy.svg";
import sweetIcon from "@/assets/fragrance/sweet.svg";
import woodyIcon from "@/assets/fragrance/wood.svg";
import { formatMoney } from "@/lib/shopify";

type QuizStep = "intro" | "recipient_type" | "gender" | "age_group" | "personality" | "mood" | "notes" | "intensity" | "occasion" | "weather" | "time_of_day" | "results";

const STEPS: QuizStep[] = [
  "intro", "recipient_type", "gender", "age_group", "personality", "mood", "notes", "intensity", "occasion", "weather", "time_of_day", "results"
];

const NOTES = [
  { id: "Woody", image: woodyIcon },
  { id: "Floral", image: floralIcon },
  { id: "Citrus", image: citrusIcon },
  { id: "Fresh", image: freshIcon },
  { id: "Fruity", image: fruityIcon },
  { id: "Musky", image: muskyIcon },
  { id: "Spicy", image: spicyIcon },
  { id: "Sweet", image: sweetIcon },
  { id: "Aquatic", image: aquaticIcon },
  { id: "Oud", image: oudIcon },
];

export function FragranceQuiz({ products, onClose, onReset }: { products: Product[], onClose: () => void, onReset: () => void }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answers, setAnswers] = useState<FragranceQuizAnswers>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).answers || {}; } catch(e){}
    }
    return {};
  });
  const [selectedNotes, setSelectedNotes] = useState<string[]>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).answers?.notes || []; } catch(e){}
    }
    return [];
  });
  const [selectedOccasion, setSelectedOccasion] = useState<string[]>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).answers?.occasion || []; } catch(e){}
    }
    return [];
  });
  const [matches, setMatches] = useState<FragranceMatch[]>([]);
  
  const step = STEPS[currentStepIndex];
  const progress = Math.max(1, Math.min(10, currentStepIndex)); // 1 to 10 for the actual questions

  const next = () => setCurrentStepIndex(i => Math.min(STEPS.length - 1, i + 1));
  const back = () => setCurrentStepIndex(i => Math.max(0, i - 1));

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('officeGpt_quizState', JSON.stringify({ step, answers: { ...answers, notes: selectedNotes, occasion: selectedOccasion } }));
    }
  }, [step, answers, selectedNotes, selectedOccasion]);

  useEffect(() => {
    if (step === "results") {
      setMatches(getFragranceRecommendations(products, answers));
    }
  }, [step, answers, products]);

  const updateAnswer = (key: keyof FragranceQuizAnswers, value: any) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
    next();
  };

  const renderContent = () => {
    switch (step) {
      case "intro":
        return (
          <div className="flex flex-col items-center justify-center text-center p-6 h-full animate-in fade-in zoom-in duration-300">
            <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
              <FlaskConical size={32} />
            </div>
            <h3 className="text-2xl font-bold mb-2">Let's find your fragrance.</h3>
            <p className="text-muted-foreground mb-8">I'll ask you a few quick questions and match you with perfumes from our collection.</p>
            <button onClick={next} className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-semibold text-lg hover:bg-primary/90 transition-colors">Start</button>
          </div>
        );

      case "recipient_type":
        return <SingleChoice title="What kind of fragrance are you looking for?" options={["For Myself", "For Someone Else", "Not Sure"]} onSelect={(v) => updateAnswer("recipient_type", v)} value={answers.recipient_type} />;
        
      case "gender":
        const forMyself = answers.recipient_type === "For Myself";
        const title = forMyself ? "What kind of fragrance do you usually wear?" : "Who are you choosing it for?";
        const opts = forMyself ? ["Men's fragrance", "Women's fragrance", "Unisex fragrance", "Not Sure"] : ["Man", "Woman", "Unisex / Anyone", "Not Sure"];
        return <SingleChoice title={title} options={opts} onSelect={(v) => updateAnswer("gender", v)} value={answers.gender} />;

      case "age_group":
        return <SingleChoice title="What's the age group?" options={["18-24", "25-34", "35-44", "45+", "Prefer not to say"]} onSelect={(v) => updateAnswer("age_group", v)} value={answers.age_group} />;

      case "personality":
        return <SingleChoice title="Which personality feels closest to you?" options={["Fresh & Energetic", "Calm & Sophisticated", "Bold & Confident", "Romantic & Charming", "Mysterious & Magnetic", "Playful & Adventurous"]} onSelect={(v) => updateAnswer("personality", v)} value={answers.personality} />;

      case "mood":
        return <SingleChoice title="What mood do you want your fragrance to create?" options={["Fresh & Uplifting", "Calm & Relaxed", "Confident & Powerful", "Romantic & Sensual", "Elegant & Refined", "Warm & Comforting"]} onSelect={(v) => updateAnswer("mood", v)} value={answers.mood} />;

      case "notes":
        return (
          <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
            <h3 className="text-xl font-bold mb-1">Which fragrance notes attract you most?</h3>
            <p className="text-sm text-muted-foreground mb-4">Choose up to 3</p>
            <div className="grid grid-cols-2 gap-2 mb-6 overflow-y-auto pr-2 pb-20">
              {NOTES.map(note => {
                const selected = selectedNotes.includes(note.id);
                return (
                  <button
                    key={note.id}
                    onClick={() => {
                      if (selected) {
                        setSelectedNotes(prev => prev.filter(n => n !== note.id));
                      } else if (selectedNotes.length < 3) {
                        setSelectedNotes(prev => [...prev, note.id]);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-xl border text-left transition-all",
                      selected ? "is-selected" : "border-border hover:border-primary/30 hover:bg-secondary"
                    )}
                  >
                    <img src={note.image} alt={note.id} className="w-8 h-8 object-contain opacity-80" />
                    <span className="font-medium text-sm">{note.id}</span>
                  </button>
                );
              })}
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t flex flex-col gap-2">
              <button
                onClick={() => {
                  setAnswers(prev => ({ ...prev, notes: selectedNotes }));
                  next();
                }}
                disabled={selectedNotes.length === 0}
                className={cn("w-full py-3 rounded-xl font-semibold transition-colors", selectedNotes.length > 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
              >
                Continue
              </button>
              <button onClick={() => updateAnswer("notes", ["Not Sure"])} className="text-sm text-muted-foreground py-2 hover:text-foreground">Not Sure</button>
            </div>
          </div>
        );

      case "intensity":
        return <SingleChoice title="How noticeable would you like your fragrance to be?" options={["Subtle", "Balanced", "Bold", "Not Sure"]} onSelect={(v) => updateAnswer("intensity", v)} value={answers.intensity} />;

      case "occasion":
        const occOpts = ["Everyday / Daily Wear", "Office / Professional", "Casual Outings", "Date Night", "Party / Night Out", "Formal / Special Occasion", "Travel / Vacation"];
        return (
          <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
            <h3 className="text-xl font-bold mb-4">Where will you mostly wear it?</h3>
            <div className="flex flex-col gap-2 mb-6 overflow-y-auto pb-20">
              {occOpts.map(opt => {
                const selected = selectedOccasion.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => {
                      if (selected) setSelectedOccasion(p => p.filter(x => x !== opt));
                      else setSelectedOccasion(p => [...p, opt]);
                    }}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-xl border transition-all text-left",
                      selected ? "is-selected" : "border-border hover:border-primary/30"
                    )}
                  >
                    <span className="font-medium">{opt}</span>
                    {selected && <Check className="text-primary" size={18} />}
                  </button>
                );
              })}
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t flex flex-col gap-2">
              <button onClick={() => { setAnswers(p => ({ ...p, occasion: selectedOccasion })); next(); }} disabled={selectedOccasion.length === 0} className={cn("w-full py-3 rounded-xl font-semibold", selectedOccasion.length > 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>Continue</button>
              <button onClick={() => updateAnswer("occasion", ["Not Sure"])} className="text-sm text-muted-foreground py-2 hover:text-foreground">Not Sure</button>
            </div>
          </div>
        );

      case "weather":
        return <SingleChoice title="What kind of weather will you mostly wear it in?" options={["Hot / Summer", "Warm / Spring", "Cool / Autumn", "Cold / Winter", "All Season", "Not Sure"]} onSelect={(v) => updateAnswer("weather", v)} value={answers.weather} />;

      case "time_of_day":
        return <SingleChoice title="When will you usually wear it?" options={["Morning", "Daytime", "Evening", "Night", "Any Time", "Not Sure"]} onSelect={(v) => updateAnswer("time_of_day", v)} value={answers.time_of_day} />;

      case "results":
        if (matches.length === 0) {
          return (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <h3 className="text-xl font-bold mb-4">I'm still learning our fragrance collection.</h3>
              <p className="text-muted-foreground mb-6">Here are the closest options currently available.</p>
              {/* Show some fallback products if they don't have metafields yet */}
              <button onClick={() => { if (typeof window !== "undefined") sessionStorage.removeItem("officeGpt_quizState"); onReset(); }} className="mt-auto w-full py-3 rounded-xl font-semibold border hover:bg-secondary">Start Over</button>
            </div>
          );
        }

        return (
          <div className="flex flex-col h-full animate-in fade-in duration-300 pb-16 overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Your fragrance matches are ready.</h3>
            <div className="flex flex-col gap-6">
              {matches.map((m, i) => (
                <div key={m.product.slug} className={cn("border rounded-2xl overflow-hidden bg-card text-card-foreground shadow-sm", i === 0 ? "border-primary ring-1 ring-primary/20" : "border-border")}>
                  {i === 0 && <div className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 uppercase tracking-wide flex items-center gap-1"><Sparkles size={14}/> BEST MATCH</div>}
                  {i === 1 && <div className="bg-secondary text-secondary-foreground text-xs font-bold px-3 py-1.5 uppercase tracking-wide border-b">GREAT MATCH</div>}
                  {i === 2 && <div className="bg-secondary text-secondary-foreground text-xs font-bold px-3 py-1.5 uppercase tracking-wide border-b">ANOTHER OPTION</div>}
                  <div className="p-4 flex flex-col">
                    <div className="flex gap-4 mb-4">
                      <div className="w-24 h-24 shrink-0"><img src={m.product.images?.[0] || ""} alt="" className="w-full h-full object-contain rounded-lg bg-secondary/50 mix-blend-multiply" /></div>
                      <div>
                        <h4 className="font-bold text-lg leading-tight mb-1 line-clamp-2">{m.product.name}</h4>
                        <p className="text-muted-foreground font-medium mb-2">{m.product.price}</p>
                        {m.matchPercentage >= 75 && (
                          <div className="inline-flex items-center text-xs font-semibold px-2 py-1 bg-secondary rounded text-secondary-foreground">
                            {m.matchPercentage}% Match
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <a href={`/products/${m.product.slug}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full bg-foreground text-background py-2.5 rounded-xl text-sm font-semibold hover:bg-foreground/90 transition-colors">
                      View Product <ChevronRight size={16} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => { setCurrentStepIndex(0); setAnswers({}); setSelectedNotes([]); setSelectedOccasion([]); }} className="mt-6 w-full py-3 rounded-xl font-semibold border text-muted-foreground hover:bg-secondary hover:text-foreground">
              Start Over
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative z-10">
      <div className="flex items-center justify-between p-4 shrink-0">
        <button onClick={() => { if (step === "intro") onReset(); else back(); }} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} /> Back
        </button>
        
        {step !== "intro" && step !== "results" && (
          <span className="text-xs font-bold text-muted-foreground tracking-widest">{progress} OF 10</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {renderContent()}
      </div>
    </div>
  );
}

function SingleChoice({ title, options, onSelect, value }: { title: string, options: string[], onSelect: (v: string) => void, value: string | undefined }) {
  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
      <h3 className="text-2xl font-bold mb-6 leading-tight">{title}</h3>
      <div className="flex flex-col gap-2 overflow-y-auto pb-6">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className={cn(
              "p-4 text-left rounded-xl border transition-all duration-200",
              value === opt 
                ? "is-selected font-semibold text-primary" 
                : opt === "Not Sure" || opt === "Prefer not to say"
                  ? "border-transparent bg-secondary/50 text-muted-foreground hover:bg-secondary"
                  : "border-border hover:border-primary/30 hover:bg-secondary/50"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
