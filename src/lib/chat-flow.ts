/**
 * Scripted conversation flow for the OfficeNeed chat assistant.
 */
import { products, type Product, type ProductCategory } from "./products";

export type ChatStepId =
  | "purpose"
  | "quantity"
  | "budget"
  | "timeline"
  | "recommendation"
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
};

export const qualificationSteps: ChatStep[] = [
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
];

export const enquirySteps: ChatStep[] = [
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
    id: "phone",
    question: "Your phone number?",
    inputType: "tel",
    placeholder: "+91 9876543210",
  },
  {
    id: "message",
    question: "Anything else we should know? (customization, branding, deadlines)",
    inputType: "text",
    placeholder: "Optional — press send to skip",
    optional: true,
  },
  {
    id: "file",
    question: "Any logo or design files you want to attach?",
    inputType: "file",
    optional: true,
  }
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
    case "Under 50": return 25;
    case "50 – 250": return 150;
    case "250 – 1000": return 500;
    case "1000+": return 1500;
    default: return undefined;
  }
}

/** Ranks catalogue products against the answers collected in chat. */
export function recommendProducts(answers: ChatAnswers, limit = 6): Product[] {
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

export function buildEnquiryMessage(answers: ChatAnswers, selected: {product: Product, quantity: number}[]): string {
  return [
    `Purpose: ${answers.purpose ?? "—"}`,
    `Budget: ${answers.budget ?? "—"}`,
    `Timeline: ${answers.timeline ?? "—"}`,
    `Selected Products: \n${selected.map((s) => `- ${s.product.name} (Qty: ${s.quantity})`).join("\n") || "None"}`,
    answers.phone ? `Phone: ${answers.phone}` : "",
    answers.file ? `File Attached: ${answers.file}` : "",
    answers.message ? `Notes: ${answers.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
