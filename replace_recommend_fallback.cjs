const fs = require("fs");
const path = "src/lib/chat-flow.ts";
let text = fs.readFileSync(path, "utf8");

const start = text.indexOf("export function recommendProducts");
const end = text.indexOf("export function buildEnquiryMessage");

const newFunc = `export function recommendProducts(catalogue: Product[], answers: ChatAnswers, refinement?: string, limit = 4): Product[] {
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
    const priceNum = parseInt(p.price?.replace(/\\D/g, "") ?? "0", 10);
    return priceNum >= minPrice && priceNum <= maxPrice;
  });

  let isFallback = false;
  if (filtered.length === 0) {
    isFallback = true;
    filtered = catalogue.filter(p => wanted.length === 0 || wanted.includes(p.category));
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
    [scored[i], scored[j]] = [scored[j], scored[i]];
  }

  scored.sort((a, b) => b.score - a.score || (a.product.featuredRank ?? 99) - (b.product.featuredRank ?? 99));

  if (refinement === "Show Premium Options" || isFallback) {
    scored.sort((a, b) => {
      const aPrice = parseInt(a.product.price?.replace(/\\D/g, "") ?? "0", 10);
      const bPrice = parseInt(b.product.price?.replace(/\\D/g, "") ?? "0", 10);
      return bPrice - aPrice; // descending
    });
  } else if (refinement === "Show Budget Options") {
    scored.sort((a, b) => {
      const aPrice = parseInt(a.product.price?.replace(/\\D/g, "") ?? "0", 10);
      const bPrice = parseInt(b.product.price?.replace(/\\D/g, "") ?? "0", 10);
      return aPrice - bPrice; // ascending
    });
  }

  const finalLimit = isFallback ? 3 : limit;
  return scored.slice(0, finalLimit).map((s) => s.product);
}

`;

text = text.slice(0, start) + newFunc + text.slice(end);
fs.writeFileSync(path, text);
console.log("Replaced recommendProducts with Smart Fallback.");
