/**
 * Scripted conversation flow for the OfficeNeed chat assistant.
 *
 * Adapted from the LeadFlow capture questionnaire: the same qualification
 * signals (purpose, quantity, budget, timeline) drive a lightweight product
 * recommendation over the local catalogue.
 */
import { products, type Product, type ProductCategory } from "./products";

export type ChatStepId =
  | "purpose"
  | "quantity"
  | "budget"
  | "timeline"
  | "name"
  | "company"
  | "email"
  | "message";

export type ChatStep = {
  id: ChatStepId;
  question: string;
  /** Quick-reply chips; when absent the user types a free-text answer. */
  options?: string[];
  inputType?: "text" | "email";
  placeholder?: string;
  optional?: boolean;
};

export const chatSteps: ChatStep[] = [
  {
    id: "purpose",
    question: "What are you shopping for?",
    options: [
      "Corporate Gifting",
      "Employee Joining Kits",
      "Festive Gifts",
      "Office Supplies",
      "Hardware & IT",
      "Printing & Branding",
    ],
  },
  {
    id: "quantity",
    question: "Roughly how many units do you need?",
    options: ["Under 50", "50 – 250", "250 – 1000", "1000+"],
  },
  {
    id: "budget",
    question: "What's your per-unit budget range?",
    options: ["Under ₹500", "₹500 – ₹1,500", "₹1,500 – ₹5,000", "₹5,000+"],
  },
  {
    id: "timeline",
    question: "When do you need delivery?",
    options: ["Immediately", "Within 15 days", "Within a month", "Just exploring"],
  },
  {
    id: "name",
    question: "Great — who should we address the quote to?",
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
    question: "And your work email for the quote?",
    inputType: "email",
    placeholder: "you@company.com",
  },
  {
    id: "message",
    question: "Anything else we should know? (customization, branding, deadlines)",
    inputType: "text",
    placeholder: "Optional — press send to skip",
    optional: true,
  },
];

export type ChatAnswers = Partial<Record<ChatStepId, string>>;

const purposeToCategories: Record<string, ProductCategory[]> = {
  "Corporate Gifting": ["Corporate Gifting", "Fragrance & Luxury Gifting"],
  "Employee Joining Kits": ["Corporate Gifting", "Office Supplies"],
  "Festive Gifts": ["Fragrance & Luxury Gifting", "Corporate Gifting"],
  "Office Supplies": ["Office Supplies"],
  "Hardware & IT": ["Hardware & IT"],
  "Printing & Branding": ["Printing & Branding"],
};

export function parseQuantity(label?: string): number | undefined {
  switch (label) {
    case "Under 50":
      return 25;
    case "50 – 250":
      return 150;
    case "250 – 1000":
      return 500;
    case "1000+":
      return 1500;
    default:
      return undefined;
  }
}

/** Ranks catalogue products against the answers collected in chat. */
export function recommendProducts(answers: ChatAnswers, limit = 3): Product[] {
  const wanted = purposeToCategories[answers.purpose ?? ""] ?? [];
  const qty = parseQuantity(answers.quantity) ?? 0;

  const scored = products.map((product) => {
    let score = 0;
    const rank = wanted.indexOf(product.category);
    if (rank === 0) score += 6;
    else if (rank > 0) score += 4;

    if (product.badge === "Featured") score += 2;
    if (product.badge === "New") score += 1;
    if (qty && (product.minimumOrderQuantity ?? 0) <= qty) score += 2;
    if (answers.timeline === "Immediately" && product.availability) score += 1;

    return { product, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || (a.product.featuredRank ?? 99) - (b.product.featuredRank ?? 99))
    .slice(0, limit)
    .map((s) => s.product);
}

export function buildEnquiryMessage(answers: ChatAnswers, recommended: Product[]): string {
  return [
    `Purpose: ${answers.purpose ?? "—"}`,
    `Quantity: ${answers.quantity ?? "—"}`,
    `Budget: ${answers.budget ?? "—"}`,
    `Timeline: ${answers.timeline ?? "—"}`,
    `Interested in: ${recommended.map((p) => p.name).join(", ") || "—"}`,
    answers.message ? `Notes: ${answers.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
