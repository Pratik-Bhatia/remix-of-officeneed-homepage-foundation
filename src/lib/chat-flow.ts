/**
 * Scripted conversation flow for the OfficeNeed chat assistant.
 */
import { products, type Product, type ProductCategory } from "./products";

export type ChatStepId =
  | "purpose"
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
    options: ["This week", "1–2 weeks", "2–4 weeks", "Flexible"],
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
  "Corporate Gifting": ["Corporate Gifting", "Fragrance Gifting"],
  "Employee Joining Kits": ["Corporate Gifting", "Office Supplies"],
  "Festive Gifts": ["Fragrance Gifting", "Corporate Gifting"],
  "Office Supplies": ["Office Supplies"],
  "Hardware & IT": ["Hardware & IT"],
  "Printing & Branding": ["Printing & Branding"],
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

export function recommendProducts(answers: ChatAnswers, refinement?: string, limit = 4): Product[] {
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
    if (answers.timeline === "This week" && product.availability) score += 1;

    // Refinement bumps
    if (refinement === "Show Premium Options") {
        const priceNum = parseInt(product.price?.replace(/\D/g, "") ?? "0", 10);
        if (priceNum > 2000) score += 5;
    }
    if (refinement === "Show Budget Options") {
        const priceNum = parseInt(product.price?.replace(/\D/g, "") ?? "0", 10);
        if (priceNum > 0 && priceNum < 1000) score += 5;
    }

    return { product, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || (a.product.featuredRank ?? 99) - (b.product.featuredRank ?? 99))
    .slice(0, limit)
    .map((s) => s.product);
}

export function buildEnquiryMessage(answers: ChatAnswers, selected: Product[]): string {
  return [
    `Purpose: ${answers.purpose ?? "—"}`,
    `Quantity: ${answers.quantity ?? "—"}`,
    `Budget: ${answers.budget ?? "—"}`,
    `Timeline: ${answers.timeline ?? "—"}`,
    `Selected Products: \n${selected.map((p) => `- ${p.name}`).join("\n") || "None"}`,
    answers.phone ? `Phone: ${answers.phone}` : "",
    answers.file ? `File Attached: ${answers.file}` : "",
    answers.message ? `Notes: ${answers.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
