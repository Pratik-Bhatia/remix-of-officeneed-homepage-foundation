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
    // RULE 1: Strict Category Bounding
    if (wanted.length > 0 && !wanted.includes(p.category)) return false;

    // RULE 2: Budget filtering with Price On Enquiry grace
    const rawPrice = p.price?.replace(/\\D/g, "") ?? "";
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
    [scored[i], scored[j]] = [scored[j], scored[i]];
  }

  scored.sort((a, b) => b.score - a.score || (a.product.featuredRank ?? 99) - (b.product.featuredRank ?? 99));

  if (refinement === "Show Premium Options" || isFallback) {
    scored.sort((a, b) => {
      const aPriceStr = a.product.price?.replace(/\\D/g, "") ?? "";
      const bPriceStr = b.product.price?.replace(/\\D/g, "") ?? "";
      const aPrice = aPriceStr ? parseInt(aPriceStr, 10) : 0;
      const bPrice = bPriceStr ? parseInt(bPriceStr, 10) : 0;
      // Handle POA in sorting? Usually POA (0) isn't the highest price, so it falls to bottom. 
      // If we want it to be considered premium, we could fake its price, but leaving it as 0 is fine.
      return bPrice - aPrice; // descending
    });
  } else if (refinement === "Show Budget Options") {
    scored.sort((a, b) => {
      const aPriceStr = a.product.price?.replace(/\\D/g, "") ?? "";
      const bPriceStr = b.product.price?.replace(/\\D/g, "") ?? "";
      const aPrice = aPriceStr ? parseInt(aPriceStr, 10) : 0;
      const bPrice = bPriceStr ? parseInt(bPriceStr, 10) : 0;
      // POA should probably float to top or bottom? If price is 0, it's 'cheapest' by number, so it shows up.
      return aPrice - bPrice; // ascending
    });
  }

  const finalLimit = isFallback ? 3 : limit;
  return scored.slice(0, finalLimit).map((s) => s.product);
}

`;

text = text.slice(0, start) + newFunc + text.slice(end);
fs.writeFileSync(path, text);
console.log("Replaced recommendProducts with strict category bounding.");
