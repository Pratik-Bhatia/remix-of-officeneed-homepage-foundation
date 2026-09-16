/**
 * Scripted conversation flow for the OfficeNeed chat assistant.
 */
import type { Product } from "./products";
import { productBelongsToCategory, getDisplayCategoryLabel, TAXONOMY, type MainCategory } from "./taxonomy";

export type ChatStepId =
  | "purpose"
  | "corporateOccasion"
  | "quantity"
  | "budget"
  | "timeline"
  | "refine"
  | "name"
  | "company"
  | "email"
  | "phone"
  | "message"
  | "file";

export type ChatStep = {
  id: ChatStepId;
  question: string;
  options?: string[];
  inputType?: "text" | "email" | "tel" | "file";
  placeholder?: string;
  optional?: boolean;
  disclaimer?: string;
};

export const chatSteps: ChatStep[] = [
  {
    id: "purpose",
    question: "What are you shopping for?",
    options: [
      "Corporate Gifting",
      "Fragrance Gifting",
    ],
  },
  {
    id: "corporateOccasion",
    question: "What is the occasion for the gift?",
    options: [
      "Employee Onboarding / Joining Kits",
      "Festive & Seasonal Gifting",
      "Client & Executive Appreciation",
      "Conferences & Corporate Events",
      "General Corporate Gifting"
    ],
  },
  {
    id: "quantity",
    question: "Great. Approximately how many people are you buying for?",
    options: ["10–25", "25–50", "50–100", "100–250", "250+"],
  },
  {
    id: "budget",
    question: "What's your approximate budget per item?",
    options: ["Under ₹500", "₹500–₹1,000", "₹1,000–₹2,500", "₹2,500+"],
  },
  {
    id: "timeline",
    question: "When do you need the products delivered?",
    options: ["This week", "1-2 weeks", "2-4 weeks", "Flexible"],
    disclaimer: "For bulk or customized orders, we'll confirm the final delivery timeline with you.",
  },
];

export const refineStep: ChatStep = {
  id: "refine",
  question: "I found a few options that fit your requirements. Would you like something more premium?",
  options: ["Show Premium Options", "Show Budget Options", "Prepare Enquiry", "Start Over"]
};

export const enquirySteps: ChatStep[] = [
  {
    id: "name",
    question: "I can prepare this enquiry for you. Where should we send the details?\n\nFirst, what is your name?",
    inputType: "text",
    placeholder: "Your full name",
  },
  {
    id: "company",
    question: "Which company are you with?",
    inputType: "text",
    placeholder: "Company name",
  },
  {
    id: "email",
    question: "What's your work email?",
    inputType: "email",
    placeholder: "you@company.com",
  },
  {
    id: "phone",
    question: "Your phone number?",
    inputType: "tel",
    placeholder: "+91 9876543210",
  },
  {
    id: "message",
    question: "Any specific notes or customization requirements?",
    inputType: "text",
    placeholder: "Optional — press send to skip",
    optional: true,
  },
  {
    id: "file",
    question: "Would you like to attach any logo or reference files?",
    inputType: "file",
    optional: true,
  }
];

export type ChatAnswers = Partial<Record<ChatStepId, string>>;

/**
 * Maps the "purpose" answer to a real Shopify main category (taxonomy.ts).
 *
 * SOURCE OF TRUTH: recommendation eligibility below is decided by
 * `productBelongsToCategory()`, which checks the product's actual Shopify
 * `collectionHandles` -- NOT `classify()` / `product.category`, which is a
 * keyword/regex guess known to cross-contaminate categories (e.g. an "Ink
 * Bottle" product matching a "bottle" keyword rule meant for drinkware).
 * This mirrors the fix already applied to the product listing page
 * (see products.index.tsx), reusing the same taxonomy.ts mapping instead of
 * duplicating a second taxonomy.
 */
export const purposeToMainCategory: Record<string, MainCategory> = {
  "Corporate Gifting": "Corporate Gifting",
  "Fragrance Gifting": "Fragrance Gifting",
  "Office Stationery": "Office Stationery",
  "Computer Peripherals": "Computer Peripherals",
};

const corporateGiftingSubHandle = (title: string) =>
  TAXONOMY["Corporate Gifting"].subcategories[title]?.handle ?? undefined;

/**
 * "What's the occasion?" as a RANKING signal within the Corporate Gifting
 * collection -- never an eligibility gate, and never a fabricated category.
 * Each entry lists the real Shopify Corporate Gifting subcategory handles
 * (taxonomy.ts) that best fit that occasion; a product in one of them gets a
 * ranking bonus, but every Corporate-Gifting-collection product stays
 * eligible regardless of occasion.
 *
 * "General Corporate Gifting" intentionally has no bias (neutral baseline).
 */
// Kept deliberately non-overlapping where possible -- live-data testing
// showed that giving multiple occasions the same subcategory (esp. "Gift
// Sets", the single largest and most POA-heavy subcategory) makes their
// results indistinguishable, since that subcategory then dominates every
// occasion's top picks equally. Each occasion keeps a distinct primary
// subcategory signal; "Drinkware & Utensils" is the one deliberate overlap
// (it genuinely suits both onboarding kits and executive gifting).
const occasionSubHandleBoost: Partial<Record<string, string[]>> = {
  "Employee Onboarding / Joining Kits": [
    corporateGiftingSubHandle("Bags"),
    corporateGiftingSubHandle("Diaries"),
    corporateGiftingSubHandle("Drinkware & Utensils"),
  ].filter((h): h is string => Boolean(h)),
  "Client & Executive Appreciation": [
    corporateGiftingSubHandle("Luxury Pens"),
    corporateGiftingSubHandle("Drinkware & Utensils"),
  ].filter((h): h is string => Boolean(h)),
  "Conferences & Corporate Events": [
    corporateGiftingSubHandle("Keychains"),
    corporateGiftingSubHandle("Mobile Stand"),
  ].filter((h): h is string => Boolean(h)),
  "Festive & Seasonal Gifting": [
    corporateGiftingSubHandle("Gift Sets"),
  ].filter((h): h is string => Boolean(h)),
};

/**
 * Short, natural-language phrasing for the same occasion-fit signal
 * `occasionSubHandleBoost` already scores on -- used ONLY to word the
 * recommendation explanation shown on each card, never to decide ranking or
 * eligibility. Kept in lockstep with `occasionSubHandleBoost`'s keys
 * deliberately: a phrase only exists here for an occasion that actually has
 * a real subcategory signal to point to ("General Corporate Gifting" has
 * none, by design, so it gets no occasion clause in the explanation either).
 */
const occasionPhrase: Partial<Record<string, string>> = {
  "Employee Onboarding / Joining Kits": "suits employee onboarding",
  "Client & Executive Appreciation": "suits client & executive appreciation",
  "Conferences & Corporate Events": "works well for conference or event giveaways",
  "Festive & Seasonal Gifting": "fits festive and seasonal gifting",
};

export function parseQuantity(label?: string): number | undefined {
  if (!label) return undefined;
  const num = parseInt(label, 10);
  if (!isNaN(num) && num.toString() === label) return num;
  switch (label) {
    case "10–25": return 15;
    case "25–50": return 40;
    case "50–100": return 75;
    case "100–250": return 150;
    case "250+": return 500;
    default: return isNaN(num) ? undefined : num;
  }
}

/** Parses "₹4,999" into 4999. Missing/quote-only price ("POA") parses to 0. */
function parsePriceNum(product: Product): number {
  const raw = product.price?.replace(/\D/g, "") ?? "";
  return raw ? parseInt(raw, 10) : 0;
}

export type RecommendationResult = {
  products: Product[];
  /**
   * True when the user specified a budget and NONE of the returned products
   * has a confirmed price inside it -- every result shown is "price on
   * request" (POA), included only as a fallback so the user isn't left with
   * nothing. The UI should say so plainly rather than presenting these as
   * budget matches (a POA price is never a confirmed match for any budget).
   */
  noConfirmedPriceMatch: boolean;
  /**
   * One short, human-readable "why this" sentence per returned product,
   * keyed by `product.slug`. Built ONLY from the same real signals the
   * scoring loop below already checked for that product (confirmed-price
   * budget fit, occasion/subcategory match) -- never from scoring numbers,
   * never from invented attributes. A product that matched none of those
   * signals gets a plain, still-truthful fallback line instead of a made-up
   * reason. Computed strictly after ranking/filtering/sorting is finalized,
   * so it cannot influence which products are returned or their order.
   */
  explanations: Record<string, string>;
};

export function recommendProducts(catalogue: Product[], answers: ChatAnswers, refinement?: string, limit = 4): RecommendationResult {
  const wantedCategory = purposeToMainCategory[answers.purpose ?? ""];

  let minPrice = 0;
  let maxPrice = Infinity;

  // Apply strict budget only if we are not explicitly breaking out of it via Premium/Budget refinement buttons.
  //
  // BUG FIX: this used to branch on `.includes("500")` / `.includes("1,000")`
  // substring checks, but "₹1,000–₹2,500" also contains the substring "500"
  // (from "2,500") -- so that bucket was silently falling into the "500" &&
  // "1,000" branch and being treated as ₹500–₹1,000 instead. Confirmed live:
  // selecting "₹1,000–₹2,500" returned the exact same results as
  // "₹500–₹1,000". Matching the exact option string (these are button-only
  // choices from `chatSteps`, never free text) removes the ambiguity.
  let hasBudget = false;
  if (answers.budget && !refinement) {
    hasBudget = true;
    switch (answers.budget) {
      case "Under ₹500": maxPrice = 500; break;
      case "₹500–₹1,000": minPrice = 500; maxPrice = 1000; break;
      case "₹1,000–₹2,500": minPrice = 1000; maxPrice = 2500; break;
      case "₹2,500+": minPrice = 2500; break;
      default: hasBudget = false; // unrecognized value -- don't apply a bogus filter
    }
  }

  let filtered = catalogue.filter(p => {
    // RULE 1: Strict Category Bounding -- Shopify collection membership is
    // the source of truth (NOT classify()/p.category).
    if (wantedCategory && !productBelongsToCategory(p.collectionHandles, wantedCategory)) return false;

    // RULE 2: Budget filtering with Price On Enquiry grace. POA products
    // (price = 0 / unset) stay eligible as a SECONDARY fallback -- they are
    // never excluded here -- but they must never be scored/sorted as if
    // their (unknown) price were confirmed to be inside the budget; that is
    // handled below, in scoring and in the premium/budget re-sorts.
    const priceNum = parsePriceNum(p);
    if (priceNum === 0) return true;

    return priceNum >= minPrice && priceNum <= maxPrice;
  });

  // Did the budget filter actually find any product with a REAL, confirmed
  // price inside the requested range, or is everything surviving here a POA
  // fallback? Used to tell the user honestly when we couldn't confirm a
  // budget match, instead of presenting POA items as if we had.
  const noConfirmedPriceMatch = hasBudget && !filtered.some((p) => {
    const n = parsePriceNum(p);
    return n > 0 && n >= minPrice && n <= maxPrice;
  });

  let isFallback = false;
  if (filtered.length === 0) {
    isFallback = true;
    // Smart Fallback (Intra-Category Only) -- still Shopify-collection-bound.
    filtered = catalogue.filter(p => !wantedCategory || productBelongsToCategory(p.collectionHandles, wantedCategory));
    // Ultra fallback if somehow category is literally empty
    if (filtered.length === 0) filtered = catalogue;
  }

  const scored = filtered.map((product) => {
    let score = 0;
    // Every surviving product already matched wantedCategory via the hard
    // filter above, so this is a flat bonus (kept for parity with the prior
    // scoring scale) rather than a differentiator between candidates.
    if (wantedCategory) score += 6;

    // A confirmed price the user can actually compare against their stated
    // budget always outranks a "price on request" (POA) product in the same
    // pool -- POA is included only as a fallback (see RULE 2 above) and must
    // never be presented as an equal, confirmed budget match.
    //
    // `budgetFit` is carried alongside `score` (not just used inline) so the
    // recommendation explanation below can honestly say "fits your budget"
    // ONLY when this exact condition was true -- it must never say that for
    // a POA product, which this same condition already guarantees.
    const budgetFit = hasBudget && parsePriceNum(product) > 0;
    if (budgetFit) score += 5;

    if (product.badge === "Featured") score += 2;
    if (product.badge === "New") score += 1;
    // NOTE on quantity/MOQ: `minimumOrderQuantity` is never populated for
    // live Shopify products -- confirmed by inspecting the store's real
    // product data: no metafield, tag, variant option, or description text
    // anywhere in the catalogue carries an MOQ signal, and the Storefront
    // token doesn't have inventory-read access either. There is therefore no
    // reliable per-product "supports quantity N" signal to score against, so
    // we deliberately do NOT fabricate one here (a prior version silently
    // applied `(product.minimumOrderQuantity ?? 0) <= qty`, which -- since
    // the field is always undefined -- was actually true for every product
    // and every quantity, i.e. a no-op that misleadingly implied MOQ had
    // been checked). The user's stated quantity still reaches the enquiry
    // sent to staff, and the recommendation copy discloses that bulk
    // availability isn't confirmed online (see ChatWidget.tsx).
    if (answers.timeline === "This week" && product.availability === "In stock") score += 1;

    // Occasion fit: a ranking nudge among products already confirmed to be
    // in the Corporate Gifting collection tree -- never a category override.
    // Same carry-alongside-score pattern as `budgetFit`: the explanation
    // below only ever claims an occasion fit when one of these two exact
    // conditions was true.
    let occasionSubcategoryFit = false;
    let occasionPriceTierFit = false;
    if (wantedCategory === "Corporate Gifting" && answers.corporateOccasion) {
      const boostHandles = occasionSubHandleBoost[answers.corporateOccasion];
      occasionSubcategoryFit = Boolean(boostHandles?.some((h) => product.collectionHandles?.includes(h)));
      if (occasionSubcategoryFit) score += 3;

      // Secondary, price-based occasion signal, using the product's real
      // Shopify price (never invented): "Client & Executive" gifting reads
      // as premium at a higher price point; "Conferences" bulk giveaways
      // read as cost-conscious. Thresholds mirror the app's own existing
      // budget-bucket boundaries (₹1,000 / "Under ₹500" tiers).
      if (answers.corporateOccasion === "Client & Executive Appreciation" && (product.priceAmount ?? 0) >= 1000) {
        occasionPriceTierFit = true;
        score += 2;
      }
      if (
        answers.corporateOccasion === "Conferences & Corporate Events" &&
        product.priceAmount !== undefined &&
        product.priceAmount <= 250
      ) {
        occasionPriceTierFit = true;
        score += 2;
      }
    }

    return { product, score, budgetFit, occasionSubcategoryFit, occasionPriceTierFit };
  });

  // Shuffle array to ensure ties (or premium rerolls) display varying options
  for (let i = scored.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = scored[i]!;
    const b = scored[j]!;
    scored[i] = b;
    scored[j] = a;
  }

  scored.sort((a, b) => b.score - a.score || (a.product.featuredRank ?? 99) - (b.product.featuredRank ?? 99));

  if (refinement === "Show Premium Options" || isFallback) {
    scored.sort((a, b) => {
      // POA (price 0) naturally sinks to the bottom of a descending sort,
      // which is the right call here -- an unconfirmed price shouldn't be
      // presented as "premium" just because we don't know it.
      return parsePriceNum(b.product) - parsePriceNum(a.product); // descending
    });
  } else if (refinement === "Show Budget Options") {
    scored.sort((a, b) => {
      const aPrice = parsePriceNum(a.product);
      const bPrice = parsePriceNum(b.product);
      // A POA product's real price is unknown -- it must never be shown as
      // "the cheapest option" just because 0 sorts first numerically, so it
      // always sinks to the bottom here rather than floating to the top.
      if (aPrice === 0 && bPrice === 0) return 0;
      if (aPrice === 0) return 1;
      if (bPrice === 0) return -1;
      return aPrice - bPrice; // ascending
    });
  }

  const finalLimit = isFallback ? 3 : limit;
  const finalEntries = scored.slice(0, finalLimit);

  // Explanations are built strictly AFTER filtering/scoring/sorting/slicing
  // above are finalized, from the exact flags each surviving product already
  // carries -- this can only describe the final result, never change it.
  const explanations: Record<string, string> = {};
  for (const entry of finalEntries) {
    explanations[entry.product.slug] = buildCorporateExplanation(answers, entry.budgetFit, entry.occasionSubcategoryFit, entry.occasionPriceTierFit);
  }

  return { products: finalEntries.map((s) => s.product), noConfirmedPriceMatch, explanations };
}

/**
 * Composes the one-sentence "why this" explanation shown on a Corporate
 * Gifting recommendation card, from the SAME real signals `recommendProducts`
 * already verified for that product (`budgetFit`, `occasionSubcategoryFit`,
 * `occasionPriceTierFit` -- see the scoring loop above). Deliberately does
 * NOT re-derive or guess at anything new, so it can never claim a fit the
 * recommendation itself didn't actually check, and never exposes the
 * underlying score. At most two short clauses, matching every product that
 * has at least one real signal to point to; products with none (e.g. a POA
 * item under "General Corporate Gifting", which has no occasion signal by
 * design) get a plain, still-truthful fallback line instead of an invented
 * reason.
 */
function buildCorporateExplanation(
  answers: ChatAnswers,
  budgetFit: boolean,
  occasionSubcategoryFit: boolean,
  occasionPriceTierFit: boolean,
): string {
  const clauses: string[] = [];

  // Budget clause -- only when the product has a CONFIRMED price inside the
  // user's stated budget (never for a POA product; `budgetFit` is false for
  // those by construction, and also false during a Premium/Budget
  // refinement, which deliberately breaks out of the stated budget).
  if (budgetFit && answers.budget) {
    clauses.push(`fits your ${answers.budget} budget`);
  }

  // Occasion clause -- only when this product actually matched the
  // occasion's real Shopify subcategory or its price-tier signal.
  if (answers.corporateOccasion && (occasionSubcategoryFit || occasionPriceTierFit)) {
    const phrase = occasionPhrase[answers.corporateOccasion];
    if (phrase) clauses.push(phrase);
  }

  if (clauses.length === 0) {
    return "A Corporate Gifting option that matches your requirement.";
  }
  const [first, second] = clauses;
  const sentence = second ? `${first} and ${second}` : first;
  return `${sentence!.charAt(0).toUpperCase()}${sentence!.slice(1)}.`;
}

export function buildEnquiryMessage(answers: ChatAnswers, selected: Product[]): string {
  return [
    `Purpose: ${answers.purpose ?? "—"}`,
    `Quantity: ${answers.quantity ?? "—"}`,
    `Budget: ${answers.budget ?? "—"}`,
    `Timeline: ${answers.timeline ?? "—"}`,
    `Selected Products: \n${selected.map((p) => `- ${p.name}`).join("\n") || "None"}`,
    answers.phone ? `Phone: ${answers.phone}` : "",
    answers.file ? `Custom Branding: ${answers.file}` : "",
    answers.message ? `Notes: ${answers.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
