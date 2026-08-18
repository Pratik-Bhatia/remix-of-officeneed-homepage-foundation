import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Send, X } from "lucide-react";
import logoUrl from "@/assets/officeneed-logo.png";
import { cn } from "@/lib/utils";
import {
  buildEnquiryMessage,
  chatSteps,
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
  products?: Product[];
};

let seq = 0;
const uid = () => `m${++seq}`;

const GREETING =
  "Hi! I'm the OfficeNeed assistant. I'll ask a few quick questions and put together the right recommendations and a quote for you.";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<ChatAnswers>({});
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const step: ChatStep | undefined = chatSteps[stepIndex];

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("officeneed:open-chat", onOpen);
    return () => window.removeEventListener("officeneed:open-chat", onOpen);
  }, []);

  // Kick off the conversation the first time the panel opens.
  useEffect(() => {
    if (!open || messages.length > 0) return;
    setMessages([{ id: uid(), role: "bot", text: GREETING }]);
    pushBot(chatSteps[0]!.question, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (open && step && !step.options) inputRef.current?.focus();
  }, [open, step, typing]);

  function pushBot(text: string, delay = 650, products?: Product[]) {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { id: uid(), role: "bot", text, ...(products ? { products } : {}) }]);
    }, delay);
  }

  async function answer(value: string) {
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

    const next: ChatAnswers = { ...answers, [step.id]: clean };
    setAnswers(next);
    setDraft("");
    setMessages((m) => [...m, { id: uid(), role: "user", text: clean || "Skip" }]);

    // After the qualification questions, show live recommendations.
    if (step.id === "timeline") {
      const picks = recommendProducts(next);
      pushBot("Based on that, here's what I'd recommend:", 700, picks);
    }

    const nextIndex = stepIndex + 1;
    if (nextIndex < chatSteps.length) {
      setStepIndex(nextIndex);
      pushBot(chatSteps[nextIndex]!.question, step.id === "timeline" ? 1400 : 650);
      return;
    }

    setStepIndex(nextIndex);
    await finish(next);
  }

  async function finish(final: ChatAnswers) {
    const picks = recommendProducts(final);
    const top = picks[0];
    setTyping(true);
    try {
      if (!top) throw new Error("No matching products");
      const result = await submitEnquiry({
        data: {
          productSlug: top.slug,
          productName: top.name,
          category: top.category,
          quantity: parseQuantity(final.quantity),
          name: final.name ?? "Chat visitor",
          company: final.company ?? "",
          email: final.email ?? "",
          message: buildEnquiryMessage(final, picks),
        },
      });
      if (!result.ok) throw new Error(result.error);
      setTyping(false);
      setDone(true);
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "bot",
          text: `Thanks ${final.name ?? ""}! Your requirement is with our team — you'll get a formal quote by email shortly.`,
          products: picks,
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
    setDone(false);
    setError(null);
    setDraft("");
    setMessages([{ id: uid(), role: "bot", text: GREETING }]);
    pushBot(chatSteps[0]!.question, 500);
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void answer(draft);
  };

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-[60] flex justify-end px-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:px-0",
        !open && "pointer-events-none",
      )}
      aria-live="polite"
    >
      <div
        role="dialog"
        aria-modal="false"
        aria-label="OfficeNeed chat assistant"
        aria-hidden={!open}
        className={cn(
          "flex h-[85svh] w-full flex-col overflow-hidden border border-border bg-background shadow-[0_24px_60px_-24px_rgb(0_0_0_/_0.45)] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:h-[560px] sm:w-[390px] sm:rounded-2xl",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="" width={640} height={122} className="h-4 w-auto" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">Assistant</p>
              <p className="text-xs text-muted-foreground">Typically replies instantly</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
            className="inline-flex size-8 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" strokeWidth={1.6} />
          </button>
        </div>

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] space-y-2", m.role === "user" && "flex justify-end")}>
                {m.text && (
                  <p
                    className={cn(
                      "whitespace-pre-line text-sm leading-relaxed",
                      m.role === "user"
                        ? "rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-primary-foreground"
                        : "text-foreground",
                    )}
                  >
                    {m.text}
                  </p>
                )}
                {m.products && m.products.length > 0 && (
                  <ul className="space-y-2">
                    {m.products.map((p) => (
                      <li key={p.slug}>
                        <Link
                          to="/products/$slug"
                          params={{ slug: p.slug }}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-3 rounded-xl border border-border p-2 transition-colors hover:bg-secondary"
                        >
                          {p.images[0] && (
                            <img
                              src={p.images[0]}
                              alt={p.name}
                              loading="lazy"
                              className="size-12 shrink-0 rounded-lg object-cover"
                            />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{p.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {p.price ? `${p.startingPrice ? "From " : ""}${p.price}` : p.category}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}

          {typing && (
            <div className="flex items-center gap-1 text-muted-foreground" aria-label="Assistant is typing">
              <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-current" />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border p-3">
          {done ? (
            <button
              type="button"
              onClick={restart}
              className="w-full rounded-full border border-border py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
            >
              Start a new enquiry
            </button>
          ) : step?.options ? (
            <div className="flex flex-wrap gap-2">
              {step.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={typing}
                  onClick={() => void answer(opt)}
                  className="rounded-full border border-border px-3.5 py-2 text-[13px] transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                type={step?.inputType === "email" ? "email" : "text"}
                placeholder={step?.placeholder ?? "Type a message"}
                disabled={typing || !step}
                className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-foreground/40 disabled:opacity-60"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={typing || (!draft.trim() && !step?.optional)}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
              >
                <Send className="size-4" strokeWidth={1.8} />
              </button>
            </form>
          )}
          {error && (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
