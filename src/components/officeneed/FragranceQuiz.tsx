import { useState, useEffect } from "react";
import { ArrowLeft, Check, Sparkles, ChevronRight, X, FlaskConical, Loader2, ShoppingBag } from "lucide-react";
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
import { formatMoney, fetchProductByHandle } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";

type QuizStep = "gender" | "scent_profile" | "occasion" | "intensity" | "budget" | "results";

const STEPS: QuizStep[] = [
  "gender", "scent_profile", "occasion", "intensity", "budget", "results"
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



function QuizAddToCart({ productSlug }: { productSlug: string }) {
  const [loading, setLoading] = useState(false);
  const addItem = useCartStore(s => s.addItem);
  const [success, setSuccess] = useState(false);

  const handleAdd = async () => {
    setLoading(true);
    setSuccess(false);
    try {
      const node = await fetchProductByHandle(productSlug);
      if (!node) throw new Error("Product not found");
      const variant = node.variants?.edges?.[0]?.node;
      if (!variant) throw new Error("No variant");
      await addItem({
        product: { node },
        variantId: variant.id,
        variantTitle: variant.title,
        price: { amount: variant.price?.amount ?? "0", currencyCode: variant.price?.currencyCode ?? "INR" },
        quantity: 1,
        selectedOptions: variant.selectedOptions ?? []
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleAdd} 
      disabled={loading || success}
      className={cn(
        "flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors",
        success ? "bg-green-600 text-white" : "bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : success ? <Check size={16} /> : <ShoppingBag size={16} />}
      {loading ? "Adding..." : success ? "Added to Cart" : "Add to Cart"}
    </button>
  );
}

export function FragranceQuiz({ products, onClose, onReset }: { products: Product[], onClose: () => void, onReset: () => void }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answers, setAnswers] = useState<FragranceQuizAnswers>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('officeGpt_quizState') : null;
    if (saved) {
      try { return JSON.parse(saved).answers || {}; } catch(e){}
    }
    return {};
  });
  const [matches, setMatches] = useState<FragranceMatch[]>([]);
  
  const step = STEPS[currentStepIndex];
  const progress = Math.min(5, currentStepIndex + 1);

  const next = () => setCurrentStepIndex(i => Math.min(STEPS.length - 1, i + 1));
  const back = () => setCurrentStepIndex(i => Math.max(0, i - 1));

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('officeGpt_quizState', JSON.stringify({ step, answers: { ...answers } }));
    }
  }, [step, answers]);

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
      case "gender":
        return <SingleChoice title="Who is this fragrance for?" options={["For Him", "For Her", "Unisex / Anyone"]} onSelect={(v) => updateAnswer("gender", v)} value={answers.gender} />;

      case "scent_profile":
        return <GridChoice title="What scent profile do they prefer?" options={["Citrus & Fresh", "Warm & Woody", "Floral & Rose", "Sweet & Vanilla", "Bold & Spicy", "Aquatic & Marine", "Fruity & Tropical", "Musky & Powdery", "Earthy & Green", "Not Sure / Mixed"]} onSelect={(v) => updateAnswer("scent_profile", v as any)} value={answers.scent_profile} />;

      case "occasion":
        return <SingleChoice title="What is the gifting occasion?" options={["Daily Office / Workwear", "Executive / Formal Milestone", "Festive / Celebration", "Casual Everyday"]} onSelect={(v) => updateAnswer("occasion", v)} value={answers.occasion} />;

      case "intensity":
        return <SingleChoice title="How strong should the fragrance be?" options={["Subtle & Light (EDT)", "Moderate", "Strong & Long-lasting (Parfum)"]} onSelect={(v) => updateAnswer("intensity", v)} value={answers.intensity} />;

      case "budget":
        return <SingleChoice title="What is your budget?" options={["Under ₹2,500", "₹2,500 – ₹5,000", "₹5,000+"]} onSelect={(v) => updateAnswer("budget", v)} value={answers.budget} />;

      case "results":
        if (matches.length === 0) {
          return (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
              <h3 className="text-xl font-bold mb-4">I'm still learning our fragrance collection.</h3>
              <p className="text-muted-foreground mb-6">Here are the closest options currently available.</p>
              {/* Show some fallback products if they don't have metafields yet */}
              
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
            
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative z-10">
      <div className="flex items-center justify-between p-4 shrink-0">
        <button onClick={() => { if (currentStepIndex === 0) onReset(); else back(); }} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} /> Back
        </button>
        
        {step !== "results" && (
          <span className="text-xs font-bold text-muted-foreground tracking-widest">{progress} OF 5</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {renderContent()}
      </div>
      
      <div className="p-4 border-t flex flex-col gap-3 bg-background z-10 shrink-0">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => {
              if (typeof window !== "undefined") sessionStorage.removeItem("officeGpt_quizState");
              onReset();
            }} 
            className="text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-md transition-colors"
          >
            Start Over
          </button>
        </div>
        <p className="text-center text-[11px] font-sans text-[#6b7280] pb-1">
          Recommendations are AI-assisted and may vary. Please verify product details before purchase.
        </p>
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

function GridChoice({ title, options, onSelect, value }: { title: string, options: string[], onSelect: (v: string) => void, value: string | undefined }) {
  const getIcon = (opt: string) => {
    switch (opt) {
      case "Citrus & Fresh": return <img src={citrusIcon} className="w-8 h-8 opacity-80" alt="Citrus" />;
      case "Warm & Woody": return <img src={woodyIcon} className="w-8 h-8 opacity-80" alt="Woody" />;
      case "Floral & Rose": return <img src={floralIcon} className="w-8 h-8 opacity-80" alt="Floral" />;
      case "Sweet & Vanilla": return <img src={sweetIcon} className="w-8 h-8 opacity-80" alt="Sweet" />;
      case "Bold & Spicy": return <img src={spicyIcon} className="w-8 h-8 opacity-80" alt="Spicy" />;
      case "Aquatic & Marine": return <img src={aquaticIcon} className="w-8 h-8 opacity-80" alt="Aquatic" />;
      case "Fruity & Tropical": return <img src={fruityIcon} className="w-8 h-8 opacity-80" alt="Fruity" />;
      case "Musky & Powdery": return <img src={muskyIcon} className="w-8 h-8 opacity-80" alt="Musky" />;
      case "Earthy & Green": return <img src={freshIcon} className="w-8 h-8 opacity-80" alt="Earthy" />;
      case "Not Sure / Mixed": return <Sparkles className="w-8 h-8 opacity-80 text-muted-foreground" />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
      <h3 className="text-2xl font-bold mb-6 leading-tight">{title}</h3>
      <div className="grid grid-cols-2 gap-[10px] overflow-y-auto pb-6">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className={cn(
              "flex flex-col items-center justify-center text-center p-3 rounded-xl border transition-all duration-200 gap-2",
              value === opt 
                ? "is-selected font-semibold text-primary bg-primary/5 border-primary" 
                : opt === "Not Sure / Mixed"
                  ? "col-span-2 border-transparent bg-secondary/50 text-muted-foreground hover:bg-secondary"
                  : "border-border hover:border-primary/30 hover:bg-secondary/50"
            )}
          >
            {getIcon(opt)}
            <span className="text-[13px] leading-tight font-medium">{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
