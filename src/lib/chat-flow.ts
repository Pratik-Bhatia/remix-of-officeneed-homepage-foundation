/**
 * Scripted conversation flow for the OfficeNeed chat assistant.
 */
import { products, type Product, type ProductCategory } from "./products";

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
    question: "When do you need them?",
    options: ["This week", "1-2 weeks", "2-4 weeks", "Flexible"],
    disclaimer: "Delivery timelines for bulk or custom orders will be coordinated directly with you via email or message based on exact quantity and location.",
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

const purposeToCategories: Record<string, ProductCategory[]> = {
  "Corporate Gifting": ["Corporate Gifting"],
  "Fragrance Gifting": ["Fragrance Gifting"],
  "Office Stationery": ["Office Stationery"],
  "Computer Peripherals": ["Computer Peripherals"],
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

export function recommendProducts(catalogue: Product[], answers: ChatAnswers, refinement?: string, limit = 4): Product[] {
  const wanted = purposeToCategories[answers.purpose ?? ""] ?? [];
  const qty = parseQuantity(answers.quantity) ?? 0;

  let minPrice = 0;
  let maxPrice = Infinity;

  // Apply strict budget only if we are not explicitly breaking out of it via Premium/Budget refinement buttons
  if (answers.budget && !refinement) {
    if (answers.budget.includes("Under")) maxPrice = 500;
    else if (answers.budget.includes("2,500+")) minPrice = 2500;
    else if (answers.budget.includes("500") && answers.budget.includes("1,000")) { minPrice = 500; maxPrice = 1000; }
    else if (answers.budget.includes("1,000") && answers.budget.includes("2,500")) { minPrice = 1000; maxPrice = 2500; }
  }

  let filtered = catalogue.filter(p => {
    // RULE 1: Strict Category Bounding
    if (wanted.length > 0 && !wanted.includes(p.category)) return false;

    // RULE 2: Budget filtering with Price On Enquiry grace
    const rawPrice = p.price?.replace(/\D/g, "") ?? "";
    const priceNum = rawPrice ? parseInt(rawPrice, 10) : 0;
    
    // Graceful handling of POA (price = 0 or null)
    if (priceNum === 0) return true;

    return priceNum >= minPrice && priceNum <= maxPrice;
  });

  let isFallback = false;
  if (filtered.length === 0) {
    isFallback = true;
    // Smart Fallback (Intra-Category Only)
    filtered = catalogue.filter(p => wanted.length === 0 || wanted.includes(p.category));
    // Ultra fallback if somehow category is literally empty
    if (filtered.length === 0) filtered = catalogue;
  }

  const scored = filtered.map((product) => {
    let score = 0;
    const rank = wanted.indexOf(product.category);
    if (rank === 0) score += 6;
    else if (rank > 0) score += 4;

    if (product.badge === "Featured") score += 2;
    if (product.badge === "New") score += 1;
    if (qty && (product.minimumOrderQuantity ?? 0) <= qty) score += 2;
    if (answers.timeline === "This week" && product.availability) score += 1;

    return { product, score };
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
      const aPriceStr = a.product.price?.replace(/\D/g, "") ?? "";
      const bPriceStr = b.product.price?.replace(/\D/g, "") ?? "";
      const aPrice = aPriceStr ? parseInt(aPriceStr, 10) : 0;
      const bPrice = bPriceStr ? parseInt(bPriceStr, 10) : 0;
      // Handle POA in sorting? Usually POA (0) isn't the highest price, so it falls to bottom. 
      // If we want it to be considered premium, we could fake its price, but leaving it as 0 is fine.
      return bPrice - aPrice; // descending
    });
  } else if (refinement === "Show Budget Options") {
    scored.sort((a, b) => {
      const aPriceStr = a.product.price?.replace(/\D/g, "") ?? "";
      const bPriceStr = b.product.price?.replace(/\D/g, "") ?? "";
      const aPrice = aPriceStr ? parseInt(aPriceStr, 10) : 0;
      const bPrice = bPriceStr ? parseInt(bPriceStr, 10) : 0;
      // POA should probably float to top or bottom? If price is 0, it's 'cheapest' by number, so it shows up.
      return aPrice - bPrice; // ascending
    });
  }

  const finalLimit = isFallback ? 3 : limit;
  return scored.slice(0, finalLimit).map((s) => s.product);
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
