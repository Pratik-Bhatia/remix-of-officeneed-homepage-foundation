import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Send, X, Plus, Check, Loader2, Paperclip, ChevronRight, CheckCircle2, Gift, Sparkles } from "lucide-react";
import { uploadEnquiryAttachment } from "@/lib/uploads.functions";
import logoUrl from "@/assets/officeneed-logo.png";
import { AiAssistantIcon } from "@/components/officeneed/AiAssistantIcon";
import { FragranceQuiz } from "./FragranceQuiz";
import { cn } from "@/lib/utils";
import {
  buildEnquiryMessage,
  chatSteps,
  enquirySteps,
  refineStep,
  parseQuantity,
  recommendProducts,
  purposeToMainCategory,
  type ChatAnswers,
  type ChatStep,
} from "@/lib/chat-flow";
import { products as staticProducts } from "@/lib/products";
import type { Product } from "@/lib/products";
import { useShopifyCatalogue, shopifyCatalogueQueryOptions } from "@/lib/shopify-overlay";
import { getDisplayCategoryLabel, getOfficeGptContextCategory } from "@/lib/taxonomy";
import { submitEnquiry } from "@/lib/enquiries.functions";

type Bubble = {
  id: string;
  role: "bot" | "user";
  text?: string;
  isActionable?: boolean; // If this bubble contains products to show
  products?: Product[];
  /** Corporate Gifting "why this" text per product slug (see chat-flow.ts's
   *  RecommendationResult.explanations). Fragrance's own per-match
   *  explanation is unrelated and lives entirely in FragranceQuiz.tsx. */
  explanations?: Record<string, string>;
};

let seq = 0;
const uid = () => `m${++seq}`;

const GREETING =
  "Hi! I'm OfficeGPT. I'll help you find the right products for your requirement.";

/**
 * Optional payload for the shared `officeneed:open-chat` event, letting a
 * caller that already knows the shopper's context (e.g. a future Fragrance
 * or Corporate Gifting page CTA) skip the generic "What are you shopping
 * for?" question. Existing generic callers (Hero's "Try the Assistant",
 * the Navbar chat icon) keep dispatching the event with no detail at all --
 * this is purely additive, no existing dispatch site needed to change.
 */
export type OfficeGptOpenContext = { category?: "fragrance" | "corporate" };

const CONTEXT_GREETING: Record<"fragrance" | "corporate", string> = {
  fragrance: "I see you're exploring Fragrance Gifting. Let's help you find the right fragrance.",
  corporate: "I see you're exploring Corporate Gifting. Let's find options based on your requirement.",
};

// Only the purposes actually offered by the "purpose" step's options
// (chatSteps[0] in chat-flow.ts) belong here -- this previously listed 5
// additional categories ("Employee Joining Kits", "Festive Gifts", "Office
// Supplies", "Hardware & IT", "Printing & Branding") that the step never
// actually offers, so they could never be selected.
const PURPOSE_ICON: Record<string, typeof Gift> = {
  "Corporate Gifting": Gift,
  "Fragrance Gifting": Sparkles,
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"qualification" | "refinement" | "enquiry" | "done" | "fragrance">("qualification");
  const catalogue = useShopifyCatalogue(staticProducts);
  // Same query key as useShopifyCatalogue() above -- react-query dedupes
  // this to the shared cached request, no extra network call -- read here
  // only to know whether the catalogue is still loading or failed, so we
  // never present recommendations against an empty fallback catalogue as if
  // it were a real "no matches" result.
  const { isLoading: catalogueLoading, isError: catalogueError } = useQuery(shopifyCatalogueQueryOptions);
  /** Set right after qualification/refinement completes; resolved by the
   *  effect below once the catalogue has actually finished loading. */
  const [pendingRecommendation, setPendingRecommendation] = useState<{ answers: ChatAnswers; refinement?: string } | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<ChatAnswers>({});
  const [messages, setMessages] = useState<Bubble[]>([]);
  /**
   * True once the shopper has given at least one REAL answer in the current
   * conversation (qualification/refinement/enquiry via `answer()`, or a
   * Fragrance quiz question via FragranceQuiz's `onAnswer`). Distinguishes a
   * conversation genuinely worth protecting from being re-seeded from an
   * unanswered one -- e.g. the greeting/first-question a context-seed or
   * Start Over just displayed does NOT by itself count as "answered", so
   * the kickoff effect below can keep re-evaluating the current page's
   * context on every reopen until the shopper actually responds to
   * something, and never again afterwards. See that effect for how this
   * differs from (and fixes) the previous "is the transcript empty" check.
   */
  const [hasAnswered, setHasAnswered] = useState(false);
  /**
   * Bumped by `restart()` on every call, unconditionally. `hasAnswered`
   * alone isn't a reliable effect trigger for this -- if Start Over is
   * clicked before any real answer was ever given (e.g. Fragrance's Start
   * Over is reachable from its very first, unanswered question), setting
   * `hasAnswered` back to `false` is a no-op (it was already false), so
   * that dependency wouldn't change and the kickoff effect wouldn't re-run
   * on its own. Including this counter in that effect's dependency array
   * guarantees every Start Over forces a fresh re-seed regardless of what
   * `hasAnswered` was already set to.
   */
  const [resetSignal, setResetSignal] = useState(0);
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
  /**
   * Handoff from the open-chat event listener to the "kick off the
   * conversation" effect below -- a ref, not state, because it's read once
   * per effect run and cleared immediately, never something that should
   * itself trigger a render. Only ever consulted while `!hasAnswered` (see
   * that effect), so it can never retroactively alter a conversation the
   * shopper has actually started answering -- reopening such a session
   * (generic, Fragrance, or Corporate) via the launcher is unaffected by
   * this, no matter which page it's reopened from.
   */
  const pendingCategoryRef = useRef<"fragrance" | "corporate" | null>(null);
  /** Cancels a pending "switch to the Fragrance flow" handoff (see the
   *  kickoff effect) if the effect re-seeds again before that 900ms timer
   *  fires -- e.g. a very fast close-and-reopen with no answer given yet --
   *  so a stale timeout can never overwrite a later, different re-seed. */
  const fragranceHandoffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Current products-listing collection, if that's where the shopper is --
   * read directly from the router's live location (moved here from Navbar,
   * which no longer has an OfficeGPT launcher of its own). `location.search`
   * is the router's generic parsed search object (query-string values only,
   * not narrowed by any route's `validateSearch`), which is all `collection`
   * needs since its value is a plain string either way.
   */
  const productsCollection = useRouterState({
    select: (s) =>
      s.location.pathname.startsWith("/products")
        ? (s.location.search as Record<string, unknown>)?.["collection"]
        : undefined,
  });

  const currentStepList = phase === "qualification" ? chatSteps : phase === "enquiry" ? enquirySteps : [];
  const step: ChatStep | undefined = phase === "refinement" ? refineStep : currentStepList[stepIndex];

  /**
   * Recommended products are now filtered by real Shopify collection
   * membership (see chat-flow.ts), not the classify()-derived `p.category`
   * field -- so `p.category` can no longer be trusted as a display label for
   * a recommended product (it may name the wrong category entirely, e.g.
   * "Office Stationery" for a pen Shopify has collectioned under Corporate
   * Gifting). Derive the label from the same Shopify collection data instead.
   */
  const wantedMainCategory = purposeToMainCategory[answers.purpose ?? ""];
  const displayCategory = (p: Product) =>
    wantedMainCategory ? getDisplayCategoryLabel(p.collectionHandles, wantedMainCategory) : p.category;

  // Scroll lock for mobile fullscreen
  useEffect(() => {
    if (!open) return;
    const isMobile = window.innerWidth < 640;
    if (!isMobile) return;

    const scrollY = window.scrollY;
    const body = document.body;
    
    const originalPosition = body.style.position;
    const originalTop = body.style.top;
    const originalWidth = body.style.width;
    const originalOverscroll = body.style.overscrollBehavior;

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overscrollBehavior = "none";

    return () => {
      body.style.position = originalPosition;
      body.style.top = originalTop;
      body.style.width = originalWidth;
      body.style.overscrollBehavior = originalOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OfficeGptOpenContext | undefined>).detail;
      // Recorded for the kickoff effect below to consume -- see that
      // effect for why a fresh-conversation guard makes this safe.
      pendingCategoryRef.current = detail?.category ?? null;
      setOpen(true);
    };
    window.addEventListener("officeneed:open-chat", onOpen);
    return () => window.removeEventListener("officeneed:open-chat", onOpen);
  }, []);

  // Kick off (or re-seed) the conversation -- generic by default, or
  // context-aware based on the shopper's current page. Runs whenever the
  // widget opens while `!hasAnswered`, i.e. the shopper hasn't yet given a
  // real answer in this conversation -- NOT merely "the transcript is
  // empty" (a context-seed or Start Over already puts a greeting/question
  // in the transcript before any real answer exists). This is what lets
  // Start Over, or simply closing and reopening with nothing answered yet,
  // keep reflecting wherever the shopper actually is right now -- while a
  // conversation with even one real answer is permanently protected from
  // ever being re-seeded, no matter which page it's reopened from.
  useEffect(() => {
    if (!open || hasAnswered) return;

    // Cancel any earlier pending Fragrance handoff -- if this run seeds
    // something else (or seeds Fragrance again), the old timer must never
    // be left free to fire later and stomp on it.
    if (fragranceHandoffTimeoutRef.current !== null) {
      clearTimeout(fragranceHandoffTimeoutRef.current);
      fragranceHandoffTimeoutRef.current = null;
    }

    // Prefer an explicit category carried by the triggering event (set by
    // the listener below); otherwise fall back to live-evaluating the
    // CURRENT route via the same taxonomy lookup the floating launcher
    // itself uses. This fallback is what makes context re-evaluation
    // immune to staleness: even if no fresh event fired (e.g. Start Over,
    // which only flips `hasAnswered` back to false), this always reflects
    // the page the shopper is on at the moment this effect actually runs,
    // never a value captured earlier.
    const category = pendingCategoryRef.current ?? getOfficeGptContextCategory(
      typeof productsCollection === "string" ? productsCollection : undefined,
    );
    pendingCategoryRef.current = null; // consume once; never leaks into a later fresh session

    // Since this effect can now legitimately fire more than once in the same
    // (still-unanswered) session -- e.g. Start Over on a Corporate page,
    // then navigating to an unrelated page and reopening -- every re-seed
    // starts from the same clean baseline, so nothing an EARLIER re-seed
    // set (answers.purpose, stepIndex, phase) can leak into a later,
    // differently-categorized one.
    setPhase("qualification");
    setAnswers({});
    setStepIndex(0);

    if (category === "fragrance") {
      // Introduce the context in the SAME conversation, then hand off to the
      // existing Fragrance flow (its own first question is "Who is this
      // fragrance for?" -- unchanged, not re-implemented here).
      setMessages([{ id: uid(), role: "bot", text: CONTEXT_GREETING.fragrance }]);
      setTyping(true);
      fragranceHandoffTimeoutRef.current = setTimeout(() => {
        fragranceHandoffTimeoutRef.current = null;
        setTyping(false);
        setPhase("fragrance");
      }, 900);
      return;
    }

    if (category === "corporate") {
      // Pre-fill exactly what a real "Corporate Gifting" button click would
      // have produced (answers.purpose + a matching user bubble) so every
      // downstream mechanism -- Back navigation, recommendation scoring,
      // the enquiry summary -- sees the identical state shape it already
      // knows how to handle, rather than a special-cased shortcut.
      setAnswers({ purpose: "Corporate Gifting" });
      setStepIndex(1);
      setMessages([
        { id: uid(), role: "bot", text: CONTEXT_GREETING.corporate },
        { id: uid(), role: "user", text: "Corporate Gifting" },
      ]);
      pushBot(chatSteps[1]!.question, 700);
      return;
    }

    // Generic entry -- unchanged.
    setMessages([{ id: uid(), role: "bot", text: GREETING }]);
    pushBot(chatSteps[0]!.question, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasAnswered, resetSignal]);

  /**
   * Resolves a pending recommendation request (set after qualification
   * completes, or after a "Show Premium/Budget Options" refinement) once the
   * shared catalogue query has actually settled. Never presents
   * recommendations against a still-loading or failed fetch, and
   * distinguishes "still loading" / "couldn't load" / "no exact match" from
   * a real set of results, instead of the previous behaviour of always
   * saying "here are a few options" and sometimes showing an empty carousel.
   */
  useEffect(() => {
    if (!pendingRecommendation) return;

    if (catalogueLoading) {
      setTyping(true);
      setLoadingMsg("Finding the best options for you...");
      return;
    }

    const { answers: pendingAnswers, refinement } = pendingRecommendation;
    setPendingRecommendation(null);
    setTyping(false);
    setLoadingMsg("");

    if (catalogueError || catalogue.length === 0) {
      pushBot(
        "I couldn't load our product catalogue just now, so I can't show recommendations yet. You're welcome to try again in a moment, or go ahead and share your details -- our team will follow up with the right options directly.",
        400,
      );
      return;
    }

    const { products: picks, noConfirmedPriceMatch, explanations } = recommendProducts(catalogue, pendingAnswers, refinement);
    setCurrentRecommendations(picks);

    if (picks.length === 0) {
      pushBot(
        "I couldn't find an exact match for that combination right now. You can adjust your answers, or go straight to enquiry and our team will help directly.",
        400,
      );
      pushBot(refineStep.question, 1400);
      return;
    }

    if (refinement) {
      pushBot(`Here are some options based on your preference for "${refinement}":`, 400, picks, true, explanations);
      pushBot(refineStep.question, 1400);
      return;
    }

    // Exact bulk-order fulfillment isn't confirmable from the data we have
    // (no MOQ/inventory-count source exists in Shopify for this store -- see
    // chat-flow.ts), so for larger quantity requests we say so plainly
    // rather than silently implying every option was vetted for that exact
    // quantity.
    const requestedQty = parseQuantity(pendingAnswers.quantity);
    const bulkNote =
      pendingAnswers.purpose === "Corporate Gifting" && requestedQty && requestedQty >= 50
        ? " Exact bulk availability for your quantity isn't listed online, so we'll confirm it when you enquire."
        : "";
    // A POA ("price on request") product must never be presented as a
    // confirmed budget match -- if that's all we found, say so plainly.
    const priceNote = noConfirmedPriceMatch
      ? " I couldn't find a product with a confirmed price in that exact budget, so these are priced on request -- we'll confirm pricing for your requirement when you enquire."
      : "";
    pushBot(`Based on what you've told me, here are a few options I'd recommend.${priceNote}${bulkNote}`, 400, picks, true, explanations);
    pushBot(refineStep.question, 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRecommendation, catalogueLoading, catalogueError, catalogue]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, currentRecommendations]);

  useEffect(() => {
    if (open && step && !step.options) inputRef.current?.focus();
  }, [open, step, typing]);

  function pushBot(text: string, delay = 650, products?: Product[], isActionable?: boolean, explanations?: Record<string, string>) {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { id: uid(), role: "bot", text, ...(products ? { products } : {}), ...(isActionable !== undefined ? { isActionable } : {}), ...(explanations ? { explanations } : {}) }]);
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

    const toBase64 = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
        reader.readAsDataURL(file);
      });

    for (const file of accepted) {
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const content = await toBase64(file);
          const res = await uploadEnquiryAttachment({
            data: { name: file.name, mimeType: file.type || "application/octet-stream", content },
          });
          if (!res.ok) throw new Error(res.error);

          // Bucket is private: store the storage path only. Staff/server code
          // generates short-lived signed URLs when the attachment is needed.
          uploadedUrls.push(res.attachment.path);
          uploadedMeta.push(res.attachment);
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

    // A real answer has now been given -- permanently protects this
    // conversation from being re-seeded by page context from here on (see
    // the kickoff effect above).
    setHasAnswered(true);

    if (step.inputType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
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
      if (step.id === "purpose" && clean === "Fragrance Gifting") {
        setPhase("fragrance");
        return;
      }
      const nextIndex = stepIndex + 1;
      if (nextIndex < chatSteps.length) {
        setStepIndex(nextIndex);
        pushBot(chatSteps[nextIndex]!.question, 500);
      } else {
        // We finished qualification -- hand off to the effect below, which
        // waits for the catalogue to actually be ready (loading/error/empty
        // are all handled there) instead of presenting recommendations
        // against a possibly-still-loading or failed fetch.
        setPhase("refinement");
        setPendingRecommendation({ answers: next });
      }
    } else if (phase === "refinement") {
      if (clean === "Start Over") {
         restart();
      } else if (clean === "Prepare Enquiry") {
         setPhase("enquiry");
         setStepIndex(0);
         pushBot(enquirySteps[0]!.question, 600);
      } else {
         // Show Premium / Show Budget -- routed through the same pending
         // effect as the initial recommendation so loading/error/no-match
         // are handled consistently (in practice the catalogue is already
         // loaded by this point, so it resolves on the very next tick).
         setPendingRecommendation({ answers: next, refinement: clean });
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
    const top = selected.length > 0 ? selected[0] : undefined;
    
    setTyping(true);
    setLoadingMsg("Preparing your enquiry...");
    try {
      const qtyNum = parseQuantity(final.quantity);

      const productPayload = selected;
      const selectedProducts = productPayload.map(p => ({
        slug: p.slug,
        name: p.name,
        category: displayCategory(p),
        quantity: qtyNum || 1,
        priceStr: p.price ?? "POA",
        priceNum: p.price ? parseInt(p.price.replace(/[^0-9]/g, ''), 10) || 0 : 0
      }));

      setTimeout(() => setLoadingMsg("Creating your summary..."), 1500);
      setTimeout(() => setLoadingMsg("Sending confirmation..."), 3000);

      const result = await submitEnquiry({
        data: {
          productSlug: top ? top.slug : "general-enquiry",
          productName: top ? top.name : "General Enquiry",
          category: top ? displayCategory(top) : "General",
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
    // Always resolve context live from wherever the shopper is RIGHT NOW,
    // never from a value captured at an earlier moment -- discard any
    // leftover event-provided category so the kickoff effect's route-based
    // fallback is what actually decides what comes next.
    pendingCategoryRef.current = null;
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
    setHasAnswered(false);
    // Guarantees the kickoff effect above re-runs even if `hasAnswered` was
    // already false (see that state's comment) -- it then re-seeds the
    // conversation, generic/Fragrance/Corporate, based on the CURRENT page.
    // Nothing is seeded directly in this function, so there is only one
    // place that ever decides how a conversation starts.
    setResetSignal((n) => n + 1);
  }

  /**
   * Lets the user revise a previous qualification answer -- parity with the
   * Fragrance flow's Back navigation, which this flow previously had no
   * equivalent for. Removes the current step's question+answer pair from
   * the transcript, clears the stored answer for the step being returned
   * to, and moves the composer back one step so it can be re-answered.
   */
  function goBack() {
    if (typing || phase !== "qualification" || stepIndex === 0) return;
    const prevIndex = stepIndex - 1;
    const prevStepId = chatSteps[prevIndex]!.id;
    setMessages((m) => m.slice(0, -2));
    setAnswers((a) => {
      const next = { ...a };
      delete next[prevStepId];
      return next;
    });
    setStepIndex(prevIndex);
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

  /**
   * The floating launcher is now the SINGLE OfficeGPT entry point (the
   * Navbar's duplicate launcher was removed). It resolves the current page's
   * category the same way the removed Navbar launcher did, then dispatches
   * the very same `officeneed:open-chat` event this component already
   * listens for below -- so every trigger on the site (this button, and
   * Hero's generic "Try the Assistant") funnels through one opening
   * mechanism, not two separate code paths.
   */
  const openLauncher = () => {
    const category = getOfficeGptContextCategory(
      typeof productsCollection === "string" ? productsCollection : undefined,
    );
    const detail: OfficeGptOpenContext | undefined = category ? { category } : undefined;
    window.dispatchEvent(new CustomEvent("officeneed:open-chat", { detail }));
  };

  return (
    <>
      {/* Floating Launcher Button -- the single OfficeGPT entry point */}
      <div className={cn(
        "fixed bottom-6 right-6 z-[100] transition-all duration-300",
        open ? "opacity-0 pointer-events-none translate-y-4 scale-95" : "opacity-100 translate-y-0 scale-100"
      )}>
        <button
          onClick={openLauncher}
          className="group flex items-center justify-center size-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Open OfficeGPT"
        >
          <AiAssistantIcon className="size-full rounded-full" />
        </button>
      </div>

      {/* Chat Widget Panel */}
      <div
        className={cn(
          "fixed inset-0 z-[110] flex flex-col justify-end sm:flex-row sm:inset-auto sm:bottom-6 sm:right-6 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
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
            "flex h-[100dvh] w-full flex-col overflow-hidden bg-background sm:h-[650px] sm:w-[420px] sm:rounded-2xl sm:border sm:border-border sm:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)]",
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

          {phase === "fragrance" ? (
              <FragranceQuiz
                products={catalogue}
                onClose={() => setOpen(false)}
                onReset={restart}
                onAnswer={() => setHasAnswered(true)}
              />
            ) : (
              <>
            {/* Progress / back navigation -- same pattern as the Fragrance
                flow's own bar, shown only while stepping through the initial
                qualification questions (purpose/occasion/quantity/budget/
                timeline), so both experiences feel like the same product. */}
            {phase === "qualification" && (
              <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={stepIndex === 0}
                  aria-label="Back to previous question"
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-0 disabled:pointer-events-none"
                >
                  <ChevronRight className="size-4 rotate-180" /> Back
                </button>
                <span className="text-xs font-bold tracking-widest text-muted-foreground">
                  {stepIndex + 1} OF {chatSteps.length}
                </span>
              </div>
            )}
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
                                {displayCategory(p)}
                              </div>
                            </div>
                          )}
                          <div className="p-3.5 flex flex-col flex-1">
                            <h4 className="font-semibold text-sm leading-tight line-clamp-2 mb-1">{p.name}</h4>
                            <p className="text-sm font-medium text-muted-foreground mb-1">
                              {p.price ? `${p.startingPrice ? "From " : ""}${p.price}` : "Enquire for price"}
                            </p>
                            {/* "Why this" explanation, built only from real
                                recommendation signals (chat-flow.ts) -- kept
                                small and muted so it supports the name/price
                                rather than competing with them. */}
                            {m.explanations?.[p.slug] && (
                              <p className="text-xs leading-snug text-muted-foreground/80 mb-4">
                                {m.explanations[p.slug]}
                              </p>
                            )}

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
                    const Icon = PURPOSE_ICON[opt];
                    return (
                      <button
                        key={opt}
                        type="button"
                        disabled={typing}
                        onClick={() => void answer(opt)}
                        className="group flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-white p-3 text-center shadow-sm transition-all hover:border-foreground/30 hover:shadow-md active:bg-primary active:text-primary-foreground disabled:opacity-50"
                      >
                        {Icon && <Icon className="size-4 opacity-50 group-hover:opacity-80 group-active:opacity-100 transition-opacity" strokeWidth={1.5} />}
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
              <div className="flex flex-col gap-2">
                {/* Only the timeline step currently sets `disclaimer` -- this
                    renders wherever the step data actually has one, rather
                    than hardcoding a step-id check, so it can't silently
                    drift out of sync with chat-flow.ts again. */}
                {step.disclaimer && (
                  <p className="px-1 text-[12px] leading-snug text-muted-foreground">{step.disclaimer}</p>
                )}
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
            <p className="mt-3 text-center text-[11px] text-[#6b7280] font-sans">
                Recommendations are based on your answers and current product data. Please verify product details before purchase.
              </p>
          </div>
          </>
        )}
        </div>
      </div>
    </>
  );
}
