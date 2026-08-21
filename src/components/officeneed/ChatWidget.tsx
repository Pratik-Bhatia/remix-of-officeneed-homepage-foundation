import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Send, X, MessageSquare, Plus, Check, Loader2, Paperclip, ChevronRight, CheckCircle2, Gift, Briefcase, Sparkles, Laptop, Printer } from "lucide-react";
import { uploadEnquiryAttachment } from "@/lib/uploads.functions";
import logoUrl from "@/assets/officeneed-logo.png";
import { AiAssistantIcon } from "@/components/officeneed/AiAssistantIcon";
import { cn } from "@/lib/utils";
import {
  buildEnquiryMessage,
  chatSteps,
  enquirySteps,
  refineStep,
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
  isActionable?: boolean; // If this bubble contains products to show
  products?: Product[];
};

let seq = 0;
const uid = () => `m${++seq}`;

const GREETING =
  "Hi! I'm OfficeGPT. I'll help you find the right products for your requirement.";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"qualification" | "refinement" | "enquiry" | "done">("qualification");
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<ChatAnswers>({});
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [typing, setTyping] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultStatus, setResultStatus] = useState<{enquiryId: string, emailSent: boolean} | null>(null);
  const [draft, setDraft] = useState("");
  const [quantitySliderVal, setQuantitySliderVal] = useState(25);
  const [exactQuantity, setExactQuantity] = useState("");
  const [exactQuantityError, setExactQuantityError] = useState("");
  
  const [selectedProductSlugs, setSelectedProductSlugs] = useState<Set<string>>(new Set());
  const [currentRecommendations, setCurrentRecommendations] = useState<Product[]>([]);
  
  const [uploads, setUploads] = useState<Array<{ name: string; size: number; status: "uploading" | "saved" | "failed"; error?: string }>>([]);
  const attachmentsRef = useRef<Array<{ path: string; name: string; mimeType: string; size: number }>>([]);
  const setAttachments = (list: Array<{ path: string; name: string; mimeType: string; size: number }>) => {
    attachmentsRef.current = list;
  };
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const currentStepList = phase === "qualification" ? chatSteps : phase === "enquiry" ? enquirySteps : [];
  const step: ChatStep | undefined = phase === "refinement" ? refineStep : currentStepList[stepIndex];

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("officeneed:open-chat", onOpen);
    return () => window.removeEventListener("officeneed:open-chat", onOpen);
  }, []);

  // Kick off the conversation
  useEffect(() => {
    if (!open || messages.length > 0) return;
    setMessages([{ id: uid(), role: "bot", text: GREETING }]);
    pushBot(chatSteps[0]!.question, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, currentRecommendations]);

  useEffect(() => {
    if (open && step && !step.options) inputRef.current?.focus();
  }, [open, step, typing]);

  function pushBot(text: string, delay = 650, products?: Product[], isActionable?: boolean) {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { id: uid(), role: "bot", text, ...(products ? { products } : {}), ...(isActionable !== undefined ? { isActionable } : {}) }]);
    }, delay);
  }

  async function handleFileUpload(files: FileList) {
    if (!step) return;

    const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
    const MAX_FILES = 5;
    const ALLOWED_TYPES = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "text/plain",
    ]);

    const selected = Array.from(files).slice(0, MAX_FILES);
    const rejected: string[] = [];
    const accepted = selected.filter((file) => {
      if (file.size > MAX_FILE_BYTES || file.size === 0) {
        rejected.push(`${file.name} (size)`);
        return false;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        rejected.push(`${file.name} (type)`);
        return false;
      }
      return true;
    });

    if (rejected.length) {
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "bot",
          text: `Sorry, I couldn't accept ${rejected.join(", ")}. Please upload images, PDFs, Office documents or CSV/text files up to 10 MB each (max 5 files).`,
        },
      ]);
    }

    if (!accepted.length) return;

    setTyping(true);
    setUploads(accepted.map((f) => ({ name: f.name, size: f.size, status: "uploading" as const })));

    let uploadedUrls: string[] = [];
    const uploadedMeta: Array<{ path: string; name: string; mimeType: string; size: number }> = [];

    const failures: string[] = [];

    for (const file of accepted) {
      // Sanitize filename
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        const randomStr = Math.random().toString(36).substring(2, 8);
        const filePath = `chat-uploads/${Date.now()}-${randomStr}-${sanitizedName}`;
        try {
          const { error } = await supabase.storage
            .from("enquiry-attachments")
            .upload(filePath, file, { contentType: file.type || "application/octet-stream" });
          if (error) throw error;

          // Bucket is private: store the storage path only. Staff/server code
          // generates short-lived signed URLs when the attachment is needed.
          uploadedUrls.push(filePath);
          uploadedMeta.push({ path: filePath, name: file.name, mimeType: file.type, size: file.size });
          setUploads((prev) =>
            prev.map((u) => (u.name === file.name ? { name: u.name, size: u.size, status: "saved" as const } : u)),
          );
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          console.error(`[OfficeNeed] Storage upload error (attempt ${attempt + 1}) for ${file.name}:`, err);
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      if (lastError) {
        const reason =
          (lastError as { message?: string })?.message ??
          (typeof lastError === "string" ? lastError : "Unknown upload error");
        failures.push(`${file.name}: ${reason}`);
        uploadedUrls.push(file.name);
        setUploads((prev) =>
          prev.map((u) => (u.name === file.name ? { ...u, status: "failed" as const, error: reason } : u)),
        );
      }
    }

    if (failures.length) {
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "bot",
          text: `I couldn't store ${failures.length === 1 ? "your file" : "some files"} (${failures.join("; ")}). Your enquiry will still be sent with the file name noted — our team may ask you to re-share it.`,
        },
      ]);
    }



    setTyping(false);
    
    // The URLs will be passed to backend and inserted into the PDF
    const fileString = uploadedUrls.join(", ");
    const next: ChatAnswers = { ...answers, [step.id]: fileString };
    setAnswers(next);
    setAttachments(uploadedMeta);
    
    // For UI display, keep it clean by showing only the file names instead of raw URLs
    const fileNames = accepted.map(f => f.name).join(", ");
    setMessages((m) => [...m, { id: uid(), role: "user", text: `📎 ${fileNames}` }]);
    
    await proceedEnquiry(next);
  }

  async function answer(value: string) {
    if (!step || typing) return;
    const clean = value.trim();
    if (!clean && !step.optional) return;
    
    if (step.inputType === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setMessages((m) => [
        ...m,
        { id: uid(), role: "user", text: clean },
        { id: uid(), role: "bot", text: "That email doesn't look quite right. Please enter a valid email address so I can send your enquiry confirmation." },
      ]);
      setDraft("");
      return;
    }

    if (step.inputType === "tel") {
      let digits = clean.replace(/\D/g, "");
      if (digits.startsWith("91") && digits.length === 12) {
        digits = digits.slice(2);
      }
      if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
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
      const nextIndex = stepIndex + 1;
      if (nextIndex < chatSteps.length) {
        setStepIndex(nextIndex);
        pushBot(chatSteps[nextIndex]!.question, 500);
      } else {
        // We finished qualification, show recommendations
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
         pushBot(`Here are some options based on your preference for "${clean}":`, 800, picks, true);
         pushBot(refineStep.question, 1800);
      }
    } else if (phase === "enquiry") {
      await proceedEnquiry(next);
    }
  }

  async function proceedEnquiry(next: ChatAnswers) {
    const nextIndex = stepIndex + 1;
    if (nextIndex < enquirySteps.length) {
      setStepIndex(nextIndex);
      pushBot(enquirySteps[nextIndex]!.question, 600);
      return;
    }
    await finish(next);
  }

  async function finish(final: ChatAnswers) {
    const selected = currentRecommendations.filter(p => selectedProductSlugs.has(p.slug));
    const top = selected.length > 0 ? selected[0] : currentRecommendations[0];
    
    setTyping(true);
    setLoadingMsg("Preparing your enquiry...");
    try {
      if (!top) throw new Error("No matching products");
      
      const qtyNum = parseQuantity(final.quantity);

      const productPayload = selected.length > 0 ? selected : [top];
      const selectedProducts = productPayload.map(p => ({
        slug: p.slug,
        name: p.name,
        category: p.category,
        quantity: qtyNum || 1,
        priceStr: p.price ?? "POA",
        priceNum: p.price ? parseInt(p.price.replace(/[^0-9]/g, ''), 10) || 0 : 0
      }));

      setTimeout(() => setLoadingMsg("Creating your summary..."), 1500);
      setTimeout(() => setLoadingMsg("Sending confirmation..."), 3000);

      const result = await submitEnquiry({
        data: {
          productSlug: top.slug,
          productName: top.name,
          category: top.category,
          quantity: qtyNum,
          name: final.name ?? "Chat visitor",
          company: final.company ?? "",
          email: final.email ?? "",
          phone: final.phone,
          message: buildEnquiryMessage(final, selected),
          purpose: final.purpose,
          budget: final.budget,
          timeline: final.timeline,
          notes: final.message,
          file: final.file,
          ...(attachmentsRef.current.length ? { attachments: attachmentsRef.current } : {}),
          selectedProducts,
        },
      });

      if (!result.ok) throw new Error(result.error);
      setTyping(false);
      setLoadingMsg("");
      setPhase("done");
      setResultStatus({ enquiryId: result.enquiryId!, emailSent: result.customerEmailSent! });
      
      const successText = result.customerEmailSent 
        ? `Your enquiry has been submitted successfully.\n\nWe've sent a confirmation to ${final.email}.\n\nEnquiry ID: ${result.enquiryId}` 
        : `Your enquiry was received successfully.\n\nWe couldn't send the confirmation email right now, but our team has received your enquiry.\n\nEnquiry ID: ${result.enquiryId}`;

      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "bot",
          text: successText,
        },
      ]);
    } catch (err) {
      setTyping(false);
      setLoadingMsg("");
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMessages((m) => [
        ...m,
        { id: uid(), role: "bot", text: "We couldn't submit your enquiry right now. Please try again." },
      ]);
    }
  }

  function restart() {
    setMessages([]);
    setAnswers({});
    setStepIndex(0);
    setPhase("qualification");
    setSelectedProductSlugs(new Set());
    setError(null);
    setDraft("");
    setQuantitySliderVal(25);
    setExactQuantity("");
    setExactQuantityError("");
    setUploads([]);
    setAttachments([]);
    setMessages([{ id: uid(), role: "bot", text: GREETING }]);
    pushBot(chatSteps[0]!.question, 500);
  }

  const toggleProduct = (slug: string) => {
    setSelectedProductSlugs(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void answer(draft);
  };

  return (
    <>
      {/* Floating Launcher Button */}
      <div className={cn(
        "fixed bottom-6 right-6 z-[100] transition-all duration-300",
        open ? "opacity-0 pointer-events-none translate-y-4 scale-95" : "opacity-100 translate-y-0 scale-100"
      )}>
        <button
          onClick={() => setOpen(true)}
          className="group flex items-center justify-center size-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Open OfficeGPT"
        >
          <AiAssistantIcon className="size-full rounded-full" />
        </button>
      </div>

      {/* Chat Widget Panel */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-[110] flex justify-end sm:inset-auto sm:bottom-6 sm:right-6 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          !open && "pointer-events-none",
          open ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        )}
        aria-live="polite"
      >
        <div
          role="dialog"
          aria-modal="false"
          aria-label="OfficeNeed OfficeGPT"
          aria-hidden={!open}
          className={cn(
            "flex h-[90svh] w-full flex-col overflow-hidden bg-background sm:h-[650px] sm:w-[420px] sm:rounded-2xl sm:border sm:border-border sm:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)]",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border bg-white/80 backdrop-blur-md px-5 py-4 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="" width={640} height={122} className="h-4 w-auto object-contain" />
              <div className="leading-tight border-l border-border pl-3">
                <p className="text-sm font-semibold text-foreground">OfficeGPT</p>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">AI Shopping Guide</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
              className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-5" strokeWidth={1.6} />
            </button>
          </div>

          {/* Transcript / Conversation */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 pb-8 bg-[#F9FAFB]/50">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                
                {/* Text Bubble */}
                {m.text && (
                  <div className={cn("max-w-[85%] space-y-2 relative")}>
                    <p
                      className={cn(
                        "whitespace-pre-line text-[14.5px] leading-relaxed shadow-sm",
                        m.role === "user"
                          ? "rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground"
                          : "rounded-2xl rounded-bl-sm bg-white border border-border/60 px-4 py-2.5 text-foreground",
                      )}
                    >
                      {m.text}
                    </p>
                  </div>
                )}
                
                {/* Products Recommendation Carousel */}
                {m.products && m.products.length > 0 && m.isActionable && (
                  <div className="w-full mt-3 overflow-x-auto pb-4 -mx-5 px-5 snap-x snap-mandatory no-scrollbar flex gap-3">
                    {m.products.map((p) => {
                      const isSelected = selectedProductSlugs.has(p.slug);
                      return (
                        <div key={p.slug} className="w-[240px] shrink-0 snap-center rounded-xl bg-white border border-border/80 shadow-sm overflow-hidden flex flex-col group transition-all hover:shadow-md">
                          {p.images[0] && (
                            <div className="relative aspect-[4/3] bg-secondary/30 overflow-hidden">
                              <img
                                src={p.images[0]}
                                alt={p.name}
                                loading="lazy"
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider text-foreground">
                                {p.category}
                              </div>
                            </div>
                          )}
                          <div className="p-3.5 flex flex-col flex-1">
                            <h4 className="font-semibold text-sm leading-tight line-clamp-2 mb-1">{p.name}</h4>
                            <p className="text-sm font-medium text-muted-foreground mb-4">
                              {p.price ? `${p.startingPrice ? "From " : ""}${p.price}` : "Enquire for price"}
                            </p>
                            
                            <div className="mt-auto space-y-2">
                              <button
                                onClick={() => toggleProduct(p.slug)}
                                className={cn(
                                  "w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200",
                                  isSelected 
                                    ? "bg-primary/10 text-primary border border-primary/20" 
                                    : "bg-foreground text-background hover:bg-foreground/90"
                                )}
                              >
                                {isSelected ? <Check className="size-4" /> : <Plus className="size-4" />}
                                {isSelected ? "Added to Enquiry" : "Add to Enquiry"}
                              </button>
                              
                              <Link
                                to="/products/$slug"
                                params={{ slug: p.slug }}
                                onClick={() => setOpen(false)}
                                className="w-full flex items-center justify-center py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                              >
                                View Product
                              </Link>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}

            {typing && (
              <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-sm bg-secondary px-4 py-3 shadow-sm text-sm">
                <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary/60" />
                {loadingMsg && <span className="ml-2 font-medium text-foreground">{loadingMsg}</span>}
              </div>
            )}
          </div>

          {/* Composer / Quick Replies */}
          <div className="border-t border-border bg-white p-4 shrink-0 shadow-[0_-5px_15px_-10px_rgba(0,0,0,0.05)]">
            {uploads.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1.5" aria-live="polite">
                {uploads.map((u) => (
                  <li
                    key={u.name}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-[12.5px]"
                  >
                    <Paperclip className="size-3.5 shrink-0 text-foreground/40" />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={u.name}>
                      {u.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{Math.max(1, Math.round(u.size / 1024))} KB</span>
                    {u.status === "uploading" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 font-medium text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> Uploading
                      </span>
                    ) : u.status === "saved" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-emerald-600">
                        <CheckCircle2 className="size-3.5" /> Saved
                      </span>
                    ) : (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 font-semibold text-destructive"
                        title={u.error ?? "Upload failed"}
                      >
                        <X className="size-3.5" /> Failed
                      </span>
                    )}
                    {u.status === "failed" && u.error && (
                      <span className="w-full basis-full text-[11.5px] font-normal text-destructive/80">{u.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {phase === "done" ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full rounded-xl bg-foreground text-background py-3 text-[14px] font-semibold transition-colors hover:bg-foreground/90"
                >
                  Continue Shopping
                </button>
                <button
                  type="button"
                  onClick={restart}
                  className="w-full rounded-xl border border-border py-3 text-[14px] font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Close Assistant
                </button>
              </div>
            ) : step?.id === "purpose" && step.options ? (
              <div className="flex flex-col gap-3 pb-2 pt-1 px-1">
                <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Choose a category</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {step.options.map((opt) => {
                    const iconMap: Record<string, any> = {
                      "Corporate Gifting": Gift,
                      "Employee Joining Kits": Briefcase,
                      "Festive Gifts": Sparkles,
                      "Office Supplies": Paperclip,
                      "Hardware & IT": Laptop,
                      "Printing & Branding": Printer,
                    };
                    const Icon = iconMap[opt] || ChevronRight;
                    return (
                      <button
                        key={opt}
                        type="button"
                        disabled={typing}
                        onClick={() => void answer(opt)}
                        className="group flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-white p-3 text-center shadow-sm transition-all hover:border-foreground/30 hover:shadow-md active:bg-primary active:text-primary-foreground disabled:opacity-50"
                      >
                        <Icon className="size-4 opacity-50 group-hover:opacity-80 group-active:opacity-100 transition-opacity" strokeWidth={1.5} />
                        <span className="text-[12.5px] font-semibold leading-tight">{opt}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : step?.id === "quantity" && step.options ? (
              <div className="flex flex-col gap-4 px-2 pb-2 pt-2">
                <div className="text-center mb-2">
                  <span className="inline-block bg-foreground text-background px-4 py-1.5 rounded-full text-[15px] font-bold shadow-sm">
                    {quantitySliderVal >= 250 ? "250+" : quantitySliderVal}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="250"
                  step="1"
                  disabled={typing}
                  value={quantitySliderVal}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setQuantitySliderVal(val);
                    if (val < 250) setExactQuantityError("");
                  }}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs font-medium text-muted-foreground px-1">
                  <span>0</span>
                  <span>250+</span>
                </div>

                {quantitySliderVal >= 250 && (
                  <div className="mt-2 flex flex-col gap-2">
                    <label className="text-[13px] font-semibold text-foreground">Enter exact quantity</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      disabled={typing}
                      value={exactQuantity}
                      onChange={(e) => {
                        setExactQuantity(e.target.value);
                        if (exactQuantityError) setExactQuantityError("");
                      }}
                      className="w-full rounded-xl border border-border/80 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/5"
                      placeholder="e.g. 500"
                    />
                    {exactQuantityError && <p className="text-[12px] font-medium text-destructive">{exactQuantityError}</p>}
                  </div>
                )}

                <button
                  type="button"
                  disabled={typing}
                  onClick={() => {
                    if (quantitySliderVal >= 250) {
                      const num = parseInt(exactQuantity, 10);
                      if (!exactQuantity.trim() || isNaN(num) || num <= 250 || num.toString() !== exactQuantity.trim()) {
                        setExactQuantityError("Please enter a valid whole number greater than 250.");
                        return;
                      }
                      setExactQuantityError("");
                      void answer(exactQuantity.trim());
                    } else {
                      void answer(quantitySliderVal.toString());
                    }
                  }}
                  className="mt-2 w-full rounded-xl bg-foreground text-background py-2.5 text-[14px] font-semibold transition-colors hover:bg-foreground/90 disabled:opacity-50"
                >
                  Confirm Quantity
                </button>
              </div>
            ) : step?.options ? (
              <div className="flex flex-wrap gap-2 justify-end">
                {step.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={typing}
                    onClick={() => void answer(opt)}
                    className="rounded-full border border-border/80 bg-white px-4 py-2 text-[14px] font-medium text-foreground shadow-sm transition-all hover:border-foreground/30 hover:bg-[#FAFAF8] active:scale-95 disabled:opacity-50"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : step?.inputType === "file" ? (
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <input
                    type="file"
                    multiple
                    disabled={typing}
                    onChange={(e) => e.target.files?.length && handleFileUpload(e.target.files)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    accept="image/*,.pdf,.doc,.docx"
                  />
                  <div className="flex items-center justify-center gap-2 w-full rounded-xl border border-dashed border-border/80 bg-secondary/30 px-4 py-8 text-[14px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-secondary/50">
                    {typing ? (
                       <Loader2 className="size-5 animate-spin text-primary" />
                    ) : (
                       <>
                         <Paperclip className="size-5 text-foreground/50" />
                         <span>Click to upload a file</span>
                       </>
                    )}
                  </div>
                </div>
                {step.optional && !typing && (
                  <button
                    type="button"
                    onClick={() => void answer("")}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground p-2"
                  >
                    Skip
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  type={step?.inputType === "email" ? "email" : step?.inputType === "tel" ? "tel" : "text"}
                  placeholder={step?.placeholder ?? "Type a message..."}
                  disabled={typing || !step}
                  className="min-w-0 flex-1 rounded-xl border border-border/80 bg-[#FAFAF8] px-4 py-3 text-[14px] outline-none transition-all placeholder:text-muted-foreground focus:border-foreground/40 focus:bg-white focus:ring-2 focus:ring-foreground/5 disabled:opacity-60"
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={typing || (!draft.trim() && !step?.optional)}
                  className="inline-flex size-[46px] shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-all hover:bg-foreground/90 disabled:opacity-40"
                >
                  <Send className="size-[18px]" strokeWidth={2} />
                </button>
              </form>
            )}
            {error && (
              <p className="mt-3 text-sm text-destructive text-center font-medium" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
