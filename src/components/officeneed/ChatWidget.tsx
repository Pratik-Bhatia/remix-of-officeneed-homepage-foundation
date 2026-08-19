import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Send, X, Check, ArrowRight, Upload, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import logoUrl from "@/assets/officeneed-logo.png";
import { cn } from "@/lib/utils";
import {
  buildEnquiryMessage,
  qualificationSteps,
  enquirySteps,
  parseQuantity,
  recommendProducts,
  type ChatAnswers,
  type ChatStep,
} from "@/lib/chat-flow";
import type { Product } from "@/lib/products";
import { submitEnquiry } from "@/lib/enquiries.functions";

type Bubble = {
  id: string;
  role: "bot" | "user";
  text?: string;
  isRecommendationContext?: boolean;
};

type SelectedProduct = {
  product: Product;
  quantity: number;
};

let seq = 0;
const uid = () => `m${++seq}`;

const GREETING =
  "Hi! I'm the OfficeNeed assistant. I'll ask a few quick questions and put together the right recommendations and a quote for you.";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  
  // phase: 'qualification' -> 'recommendation' -> 'enquiry' -> 'done'
  const [phase, setPhase] = useState<'qualification' | 'recommendation' | 'enquiry' | 'done'>('qualification');
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<ChatAnswers>({});
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const [recommended, setRecommended] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  
  // For file upload mock
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const currentStepList = phase === 'qualification' ? qualificationSteps : (phase === 'enquiry' ? enquirySteps : []);
  const step: ChatStep | undefined = currentStepList[stepIndex];

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("officeneed:open-chat", onOpen);
    return () => window.removeEventListener("officeneed:open-chat", onOpen);
  }, []);

  useEffect(() => {
    if (!open || messages.length > 0) return;
    setMessages([{ id: uid(), role: "bot", text: GREETING }]);
    pushBot(qualificationSteps[0]!.question, 500);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (open && step && !step.options) inputRef.current?.focus();
  }, [open, step, typing]);

  function pushBot(text: string, delay = 650, isContext = false) {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { id: uid(), role: "bot", text, isRecommendationContext: isContext }]);
    }, delay);
  }

  async function answer(value: string) {
    if (phase === 'recommendation') {
      // Free text refine
      const clean = value.trim();
      if (!clean) return;
      setMessages((m) => [...m, { id: uid(), role: "user", text: clean }]);
      setDraft("");
      setTyping(true);
      window.setTimeout(() => {
         setTyping(false);
         setMessages((m) => [...m, { id: uid(), role: "bot", text: "I've updated the recommendations on the right based on your input." }]);
         // mock shuffling recommendations
         setRecommended((r) => [...r].reverse());
      }, 1000);
      return;
    }

    if (!step) return;
    const clean = value.trim();
    if (!clean && !step.optional) return;
    if (step.inputType === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setMessages((m) => [
        ...m,
        { id: uid(), role: "user", text: clean },
        { id: uid(), role: "bot", text: "That email doesn't look right — could you re-enter it?" },
      ]);
      setDraft("");
      return;
    }

    if (step.inputType === "tel" && !clean.match(/[0-9]{5}/) && !step.optional) {
       setMessages((m) => [
        ...m,
        { id: uid(), role: "user", text: clean },
        { id: uid(), role: "bot", text: "Please enter a valid phone number." },
      ]);
      setDraft("");
      return;
    }

    const next: ChatAnswers = { ...answers, [step.id]: clean };
    setAnswers(next);
    setDraft("");
    setMessages((m) => [...m, { id: uid(), role: "user", text: clean || (step.id === 'file' && !clean ? "Skip" : "Skip") }]);

    const nextIndex = stepIndex + 1;
    if (nextIndex < currentStepList.length) {
      setStepIndex(nextIndex);
      pushBot(currentStepList[nextIndex]!.question, 650);
      return;
    }

    if (phase === 'qualification') {
       // Transition to recommendation
       const picks = recommendProducts(next);
       setRecommended(picks);
       setPhase('recommendation');
       pushBot("Based on that, here's what I'd recommend on the right. You can select products to add to your enquiry, or tell me here if you want to fine-tune (e.g. 'Lower budget').", 700, true);
    } else if (phase === 'enquiry') {
       await finish(next);
    }
  }

  async function finish(final: ChatAnswers) {
    setTyping(true);
    try {
      if (selectedProducts.length === 0) throw new Error("Please select at least one product.");
      const top = selectedProducts[0]!.product;
      const result = await submitEnquiry({
        data: {
          productSlug: top.slug,
          productName: top.name,
          category: top.category,
          quantity: selectedProducts[0]!.quantity,
          name: final.name ?? "Chat visitor",
          company: final.company ?? "",
          email: final.email ?? "",
          message: buildEnquiryMessage(final, selectedProducts),
        },
      });
      if (!result.ok) throw new Error(result.error);
      setTyping(false);
      setPhase('done');
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "bot",
          text: `Thanks ${final.name ?? ""}! Your requirement is with our team — you'll get a formal quote by email shortly.`,
        },
      ]);
    } catch (err) {
      setTyping(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMessages((m) => [
        ...m,
        { id: uid(), role: "bot", text: "I couldn't send that through. Please try again in a moment." },
      ]);
    }
  }

  function restart() {
    setMessages([]);
    setAnswers({});
    setStepIndex(0);
    setPhase('qualification');
    setError(null);
    setDraft("");
    setSelectedProducts([]);
    setRecommended([]);
    setMessages([{ id: uid(), role: "bot", text: GREETING }]);
    pushBot(qualificationSteps[0]!.question, 500);
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void answer(draft);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    setUploadProgress(0);
    
    let prog = 0;
    const interval = setInterval(() => {
      prog += 10;
      setUploadProgress(prog);
      if (prog >= 100) {
        clearInterval(interval);
        setUploading(false);
        void answer(file.name);
      }
    }, 200);
  };

  const toggleProduct = (product: Product) => {
    setSelectedProducts(prev => {
      const exists = prev.find(p => p.product.slug === product.slug);
      if (exists) return prev.filter(p => p.product.slug !== product.slug);
      return [...prev, { product, quantity: parseQuantity(answers.quantity) || 50 }];
    });
  };

  const updateQuantity = (slug: string, delta: number) => {
    setSelectedProducts(prev => prev.map(p => {
      if (p.product.slug === slug) {
         const nq = Math.max(1, p.quantity + delta);
         return { ...p, quantity: nq };
      }
      return p;
    }));
  };

  const goToEnquiry = () => {
    if (selectedProducts.length === 0) return;
    setPhase('enquiry');
    setStepIndex(0);
    pushBot(enquirySteps[0]!.question, 500);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm px-0 sm:px-6 transition-all duration-300",
        !open && "pointer-events-none opacity-0"
      )}
      aria-live="polite"
    >
      <div
        role="dialog"
        aria-modal="false"
        aria-label="OfficeNeed chat assistant"
        aria-hidden={!open}
        className={cn(
          "flex flex-col sm:flex-row h-full w-full sm:h-[85vh] sm:max-w-5xl sm:rounded-2xl overflow-hidden border border-border bg-background shadow-[0_24px_60px_-24px_rgb(0_0_0_/_0.25)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open
            ? "translate-y-0 opacity-100 scale-100"
            : "translate-y-8 opacity-0 scale-95",
        )}
      >
        {/* Left Panel: Chat */}
        <div className={cn(
            "flex flex-col border-r border-border bg-card/30 transition-all duration-500",
          phase === 'recommendation' ? "w-full sm:w-[400px] shrink-0 hidden sm:flex" : phase === 'enquiry' ? "w-full sm:w-[400px] shrink-0 flex" : "w-full sm:mx-auto sm:w-[500px]",
          phase === 'done' && "w-full sm:mx-auto sm:w-[500px]"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 bg-background">
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="" width={640} height={122} className="h-5 w-auto" />
              <div className="leading-tight">
                <p className="text-sm font-semibold">Assistant</p>
                <p className="text-xs text-muted-foreground">AI Shopping Guide</p>
              </div>
            </div>
            {(!phase || phase === 'qualification' || phase === 'done') && (
              <button
                type="button"
                aria-label="Close chat"
                onClick={() => setOpen(false)}
                className="inline-flex size-8 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-5" strokeWidth={1.6} />
              </button>
            )}
            {(phase === 'recommendation' || phase === 'enquiry') && (
              <button
                type="button"
                aria-label="Close chat"
                onClick={() => setOpen(false)}
                className="sm:hidden inline-flex size-8 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-5" strokeWidth={1.6} />
              </button>
            )}
          </div>

          {/* Transcript */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-6">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] space-y-2", m.role === "user" && "flex justify-end")}>
                  {m.text && (
                    <p
                      className={cn(
                        "whitespace-pre-line text-[14.5px] leading-relaxed",
                        m.role === "user"
                          ? "rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground shadow-sm"
                          : "rounded-2xl rounded-bl-sm bg-background border border-border/60 px-4 py-2.5 text-foreground shadow-sm"
                      )}
                    >
                      {m.text}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex items-center gap-1.5 text-muted-foreground px-1 py-2" aria-label="Assistant is typing">
                <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary/60" />
              </div>
            )}
          </div>

          {/* Composer */}
          {phase !== 'done' && (
            <div className="border-t border-border bg-background p-4">
              {step?.options && phase !== 'recommendation' ? (
                <div className="flex flex-wrap gap-2">
                  {step.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={typing}
                      onClick={() => void answer(opt)}
                      className="rounded-full border border-border/80 bg-card px-4 py-2.5 text-sm font-medium transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : step?.inputType === 'file' ? (
                <div className="flex flex-col gap-3">
                  {uploading ? (
                    <div className="flex flex-col gap-2 p-4 border border-border rounded-xl">
                       <div className="flex items-center justify-between text-sm">
                         <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin"/> Uploading...</span>
                         <span>{uploadProgress}%</span>
                       </div>
                       <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-200" style={{width: `${uploadProgress}%`}} />
                       </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="flex-1 flex items-center justify-center gap-2 rounded-full border border-dashed border-primary/40 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary cursor-pointer hover:bg-primary/10 transition-colors">
                        <Upload className="size-4" />
                        <span>Upload File</span>
                        <input type="file" className="hidden" onChange={handleFileUpload} />
                      </label>
                      {step.optional && (
                        <button onClick={() => void answer('')} className="rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          Skip
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={onSubmit} className="flex items-center gap-2 relative">
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    type={step?.inputType === "email" ? "email" : step?.inputType === 'tel' ? 'tel' : "text"}
                    placeholder={phase === 'recommendation' ? "e.g. Lower budget, faster delivery..." : (step?.placeholder ?? "Type a message")}
                    disabled={typing || (!step && phase !== 'recommendation')}
                    className="w-full rounded-full border border-border/80 bg-background pl-4 pr-12 py-3 text-sm outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-60 shadow-sm"
                  />
                  <button
                    type="submit"
                    aria-label="Send message"
                    disabled={typing || (!draft.trim() && !step?.optional && phase !== 'recommendation')}
                    className="absolute right-1.5 top-1.5 bottom-1.5 inline-flex aspect-square items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary"
                  >
                    <Send className="size-4 -ml-0.5" strokeWidth={2} />
                  </button>
                </form>
              )}
              {error && (
                <p className="mt-3 text-xs font-medium text-destructive px-1" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
          {phase === 'done' && (
             <div className="border-t border-border bg-background p-4">
                <button
                  type="button"
                  onClick={restart}
                  className="w-full rounded-full border border-border py-3 text-sm font-medium transition-colors hover:bg-secondary"
                >
                  Start a new enquiry
                </button>
             </div>
          )}
        </div>

        {/* Right Panel: Products & Enquiry */}
        {(phase === 'recommendation' || phase === 'enquiry') && (
          <div className={cn("flex-1 flex-col bg-background h-full sm:h-auto overflow-hidden animate-in fade-in slide-in-from-right-8 duration-500", phase === 'enquiry' ? "hidden sm:flex" : "flex")}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-background z-10">
              <h2 className="text-lg font-semibold tracking-tight">
                {phase === 'recommendation' ? "Recommended for you" : "Enquiry Summary"}
              </h2>
              <button
                type="button"
                aria-label="Close chat"
                onClick={() => setOpen(false)}
                className="hidden sm:inline-flex size-8 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-5" strokeWidth={1.6} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-secondary/10">
              {phase === 'recommendation' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-20">
                  {recommended.map(p => {
                    const isSelected = selectedProducts.some(sp => sp.product.slug === p.slug);
                    return (
                      <div key={p.slug} className={cn(
                        "group flex flex-col rounded-2xl border bg-background overflow-hidden transition-all duration-200 hover:shadow-md",
                        isSelected ? "border-primary ring-1 ring-primary/20" : "border-border"
                      )}>
                        <div className="aspect-[4/3] bg-secondary relative overflow-hidden">
                           {p.images[0] && <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />}
                           <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur text-[11px] font-medium px-2 py-0.5 shadow-sm text-green-700 uppercase tracking-wide">
                                 <Check className="size-3" /> Matches criteria
                              </span>
                           </div>
                           <Link to="/products/$slug" params={{slug: p.slug}} target="_blank" className="absolute inset-0 z-0" />
                        </div>
                        <div className="p-4 flex flex-col flex-1">
                           <h3 className="font-semibold text-base leading-snug mb-1 group-hover:text-primary transition-colors">{p.name}</h3>
                           <p className="text-sm text-muted-foreground mb-4">{p.category}</p>
                           <div className="mt-auto flex items-center justify-between">
                             <p className="font-semibold text-[15px]">{p.price ? `${p.startingPrice ? 'From ' : ''}${p.price}` : 'Price on request'}</p>
                             <button
                               onClick={() => toggleProduct(p)}
                               className={cn(
                                 "relative z-10 text-xs font-medium px-4 py-2 rounded-full transition-colors",
                                 isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                               )}
                             >
                               {isSelected ? 'Added ✓' : 'Add to enquiry'}
                             </button>
                           </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              
              {phase === 'enquiry' && (
                 <div className="max-w-2xl mx-auto space-y-6 pb-20">
                    <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
                       <h3 className="font-semibold mb-5 flex items-center gap-2">
                          <Check className="size-4 text-primary" /> Selected Products
                       </h3>
                       <div className="space-y-4">
                         {selectedProducts.map(sp => (
                           <div key={sp.product.slug} className="flex items-center gap-4 p-3 rounded-xl border border-border/60 bg-card">
                             {sp.product.images[0] && <img src={sp.product.images[0]} className="size-16 rounded-lg object-cover bg-secondary" />}
                             <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{sp.product.name}</p>
                                <p className="text-xs text-muted-foreground">{sp.product.price || sp.product.category}</p>
                             </div>
                             <div className="flex items-center gap-3 bg-secondary/50 rounded-full px-1 py-1">
                                <button onClick={() => updateQuantity(sp.product.slug, -10)} className="p-1 hover:bg-background rounded-full transition-colors"><Minus className="size-3.5"/></button>
                                <span className="text-sm font-medium w-8 text-center">{sp.quantity}</span>
                                <button onClick={() => updateQuantity(sp.product.slug, 10)} className="p-1 hover:bg-background rounded-full transition-colors"><Plus className="size-3.5"/></button>
                             </div>
                             <button onClick={() => toggleProduct(sp.product)} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                               <Trash2 className="size-4" />
                             </button>
                           </div>
                         ))}
                       </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
                       <h3 className="font-semibold mb-5 text-sm text-muted-foreground uppercase tracking-wider">Requirement Details</h3>
                       <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-4 text-sm">
                         <div><dt className="text-muted-foreground mb-1">Purpose</dt><dd className="font-medium">{answers.purpose || '—'}</dd></div>
                         <div><dt className="text-muted-foreground mb-1">Timeline</dt><dd className="font-medium">{answers.timeline || '—'}</dd></div>
                         <div><dt className="text-muted-foreground mb-1">Budget</dt><dd className="font-medium">{answers.budget || '—'}</dd></div>
                       </dl>
                    </div>
                 </div>
              )}
            </div>

            {/* Bottom Sticky Action Bar */}
            <div className="border-t border-border bg-background p-4 px-6 flex justify-between items-center z-10 shadow-[0_-10px_20px_-10px_rgb(0_0_0_/_0.05)]">
               {phase === 'recommendation' ? (
                 <>
                   <div className="text-sm">
                     <span className="font-medium">{selectedProducts.length}</span> items selected
                   </div>
                   <button
                     onClick={goToEnquiry}
                     disabled={selectedProducts.length === 0}
                     className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     Proceed to Enquiry <ArrowRight className="size-4" />
                   </button>
                 </>
               ) : (
                 <>
                   <div className="text-sm text-muted-foreground">
                     Complete details on left to submit
                   </div>
                 </>
               )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
