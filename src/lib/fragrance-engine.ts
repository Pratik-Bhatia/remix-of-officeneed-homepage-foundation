import type { Product } from "./products";

export type FragranceQuizAnswers = {
  gender?: "For Him" | "For Her" | "Unisex / Anyone";
  scent_profile?: "Citrus & Fresh" | "Warm & Woody" | "Floral & Rose" | "Sweet & Vanilla" | "Bold & Spicy" | "Aquatic & Marine" | "Fruity & Tropical" | "Musky & Powdery" | "Earthy & Green" | "Not Sure / Mixed";
  occasion?: "Daily Office / Workwear" | "Executive / Formal Milestone" | "Festive / Celebration" | "Casual Everyday";
  intensity?: "Subtle & Light (EDT)" | "Moderate" | "Strong & Long-lasting (Parfum)";
  budget?: "Under ₹2,500" | "₹2,500 – ₹5,000" | "₹5,000+";
};

export type FragranceMatch = {
  product: Product;
  score: number;
  matchPercentage: number;
  explanation: string;
};

// Simplified maps for overlapping concepts
const GENDER_MAP: Record<string, string> = {
  "Men's fragrance": "Men",
  "Man": "Men",
  "Women's fragrance": "Women",
  "Woman": "Women",
  "Unisex fragrance": "Unisex",
  "Unisex / Anyone": "Unisex"
};

function arrayIntersect(arr1?: string[], arr2?: string[]) {
  if (!arr1 || !arr2 || arr1.length === 0 || arr2.length === 0) return 0;
  return arr1.filter(v => arr2.some(v2 => v.toLowerCase().includes(v2.toLowerCase()) || v2.toLowerCase().includes(v.toLowerCase()))).length;
}

export function getFragranceRecommendations(products: Product[], answers: FragranceQuizAnswers): FragranceMatch[] {
  let eligibleProducts = products.filter(p => p.category === "Fragrance Gifting" || p.subcategories?.includes("Perfume Gift Sets") || p.subcategories?.includes("European Perfume") || p.subcategories?.includes("Middle Eastern Perfume"));

  // 1. Strict Gender Filtering (Pre-LLM Logic Fix)
  if (answers.gender) {
    eligibleProducts = eligibleProducts.filter(p => {
      const desc = (p.description || "").toLowerCase();
      const tags = (p.tags || []).map(t => t.toLowerCase());
      const hasTagOrDesc = (term: string) => tags.includes(term) || desc.includes(term);
      const isUnisex = hasTagOrDesc("unisex");
      
      // We check for men and women to prevent partial matches
      const hasMen = tags.some(t => /\bmen\b/.test(t)) || tags.some(t => /\bman\b/.test(t)) || /\bmen\b/.test(desc) || /\bman\b/.test(desc);
      const hasWomen = tags.some(t => /\bwomen\b/.test(t)) || tags.some(t => /\bwoman\b/.test(t)) || /\bwomen\b/.test(desc) || /\bwoman\b/.test(desc);

      if (answers.gender === "For Him") {
        return isUnisex || hasMen;
      }
      if (answers.gender === "For Her") {
        return isUnisex || hasWomen;
      }
      if (answers.gender === "Unisex / Anyone") {
        return isUnisex;
      }
      return true;
    });
  }

  const matches = eligibleProducts.map(product => {
    let score = 0;
    let maxPossibleScore = 0;
    const matchedReasons: string[] = [];
    
    let profile = product.fragranceProfile;
 
    if (!profile) {
      const desc = (product.description || "").toLowerCase();
      const tags = (product.tags || []).map(t => t.toLowerCase());
      const head = (s: string, sep: string) => (s.split(sep)[0] ?? "").toLowerCase();
      
      profile = {
        notes: ["Floral", "Citrus", "Woody", "Spicy", "Fresh", "Sweet", "Fruity", "Musk", "Oriental", "Aquatic"].filter(n => desc.includes(n.toLowerCase()) || tags.some(t => t.includes(n.toLowerCase()))),
        occasion: ["Everyday / Daily Wear", "Office / Professional", "Casual Outings", "Date Night", "Party / Night Out", "Formal / Special Occasion", "Travel / Vacation"].filter(o => desc.includes(head(o, " / ")) || tags.some(t => t.includes(head(o, " / ")))),
        recipient: ["Men", "Women", "Unisex"].filter(r => desc.includes(r.toLowerCase()) || tags.some(t => t.includes(r.toLowerCase()))),
        personality: ["Fresh & Energetic", "Calm & Sophisticated", "Bold & Confident", "Romantic & Charming", "Mysterious & Magnetic", "Playful & Adventurous"].filter(p => desc.includes(head(p, " ")) || tags.some(t => t.includes(head(p, " ")))),
        mood: ["Fresh & Uplifting", "Calm & Relaxed", "Confident & Powerful", "Romantic & Sensual", "Elegant & Refined", "Warm & Comforting"].filter(m => desc.includes(head(m, " ")) || tags.some(t => t.includes(head(m, " ")))),
        weather: ["Hot", "Warm", "Cool", "Cold", "All Weather"].filter(w => desc.includes(w.toLowerCase()) || tags.some(t => t.includes(w.toLowerCase()))),
        time_of_day: ["Morning", "Daytime", "Evening", "Night", "All Day"].filter(td => desc.includes(td.toLowerCase()) || tags.some(t => t.includes(td.toLowerCase()))),
        age_group: ["18-24", "25-34", "35-44", "45+"].filter(a => desc.includes(a) || tags.some(t => t.includes(a))),
      };
      const intensityVal = ["Subtle", "Balanced", "Bold"].find(i => desc.includes(i.toLowerCase()) || tags.some(t => t.includes(i.toLowerCase())));
      if (intensityVal) profile.intensity = intensityVal;
      
      // If we synthesized it but found absolutely nothing, give it a tiny base score just so it exists
      if (!profile.notes?.length && !profile.occasion?.length && !profile.recipient?.length) {
         return { product, score: 0.1, matchPercentage: 10, explanation: "One of our classic fragrances." };
      }
    }


    // We already strictly filtered by gender, so we can ignore it for score, or add a flat score just to boost all.
    score += 15;
    maxPossibleScore += 15;

    // 1. Scent Profile (Notes equivalent) (30%)
    const desc = (product.description || "").toLowerCase();
      const tags = (product.tags || []).join(" ").toLowerCase();
      const txt = desc + " " + tags;

      if (answers.scent_profile && answers.scent_profile !== "Not Sure / Mixed") {
      maxPossibleScore += 30;
      let matched = false;
      if (answers.scent_profile === "Citrus & Fresh" && (txt.includes("fresh") || txt.includes("citrus") || txt.includes("lemon"))) matched = true;
      else if (answers.scent_profile === "Warm & Woody" && (txt.includes("warm") || txt.includes("wood") || txt.includes("oud") || txt.includes("amber") || txt.includes("cedar"))) matched = true;
      else if (answers.scent_profile === "Floral & Rose" && (txt.includes("floral") || txt.includes("flower") || txt.includes("rose") || txt.includes("jasmine"))) matched = true;
      else if (answers.scent_profile === "Sweet & Vanilla" && (txt.includes("sweet") || txt.includes("vanilla") || txt.includes("caramel"))) matched = true;
      else if (answers.scent_profile === "Bold & Spicy" && (txt.includes("bold") || txt.includes("spic") || txt.includes("pepper"))) matched = true;
      else if (answers.scent_profile === "Aquatic & Marine" && (txt.includes("aqua") || txt.includes("water") || txt.includes("marine") || txt.includes("ocean") || txt.includes("sea"))) matched = true;
      else if (answers.scent_profile === "Fruity & Tropical" && (txt.includes("fruit") || txt.includes("peach") || txt.includes("apple") || txt.includes("tropical") || txt.includes("coconut"))) matched = true;
      else if (answers.scent_profile === "Musky & Powdery" && (txt.includes("musk") || txt.includes("powder") || txt.includes("soft"))) matched = true;
      else if (answers.scent_profile === "Earthy & Green" && (txt.includes("earth") || txt.includes("green") || txt.includes("moss") || txt.includes("vetiver"))) matched = true;
      
      if (matched) {
        score += 30;
        matchedReasons.push(answers.scent_profile.toLowerCase() + " profile");
      }
    }

    // 2. Occasion (25%)
    if (answers.occasion) {
      maxPossibleScore += 25;
      let matched = false;
      if (answers.occasion === "Daily Office / Workwear" && (txt.includes("office") || txt.includes("daily") || txt.includes("work") || txt.includes("everyday"))) matched = true;
      else if (answers.occasion === "Executive / Formal Milestone" && (txt.includes("formal") || txt.includes("executive") || txt.includes("luxury") || txt.includes("premium"))) matched = true;
      else if (answers.occasion === "Festive / Celebration" && (txt.includes("festiv") || txt.includes("party") || txt.includes("celebrat") || txt.includes("special"))) matched = true;
      else if (answers.occasion === "Casual Everyday" && (txt.includes("casual") || txt.includes("everyday") || txt.includes("daily"))) matched = true;

      // Generous fallback if it's generally versatile
      if (matched || txt.includes("versatile")) {
        score += 25;
        matchedReasons.push("matching the occasion");
      }
    }

    // 3. Intensity (15%)
    if (answers.intensity) {
      maxPossibleScore += 15;
      const desc = (product.description || "").toLowerCase();
      let matched = false;
      
      if (answers.intensity === "Subtle & Light (EDT)" && (desc.includes("edt") || desc.includes("eau de toilette") || desc.includes("subtle") || desc.includes("light"))) matched = true;
      else if (answers.intensity === "Strong & Long-lasting (Parfum)" && (desc.includes("parfum") || desc.includes("strong") || desc.includes("long-lasting"))) matched = true;
      else if (answers.intensity === "Moderate") matched = true; // Safe fallback

      if (matched) {
        score += 15;
        matchedReasons.push("the right intensity");
      }
    }

    // 4. Budget (15%)
    if (answers.budget) {
      maxPossibleScore += 15;
      const price = product.priceAmount || 0;
      let matched = false;
      if (answers.budget === "Under ₹2,500" && price <= 2500) matched = true;
      else if (answers.budget === "₹2,500 – ₹5,000" && price > 2500 && price <= 5000) matched = true;
      else if (answers.budget === "₹5,000+" && price > 5000) matched = true;

      if (matched) {
        score += 15;
        matchedReasons.push("fitting your budget");
      }
    }

    let matchPercentage = maxPossibleScore > 0 ? Math.round((score / maxPossibleScore) * 100) : 50;
    
    // Add some entropy so 100% isn't perfectly identical across everything if we lack data
    if (matchPercentage > 98) matchPercentage = 98;
    if (maxPossibleScore === 0) matchPercentage = 75; // Baseline if user selects "Not Sure" for everything

    let explanation = `A great choice for you.`;
    if (matchedReasons.length > 0) {
      // Natural language explanation
      const uniqueReasons = Array.from(new Set(matchedReasons)).slice(0, 3);
      if (uniqueReasons.length === 1) {
        explanation = `Matches your preference for ${uniqueReasons[0]}.`;
      } else if (uniqueReasons.length === 2) {
        explanation = `Matches your preference for ${uniqueReasons[0]} and features ${uniqueReasons[1]}.`;
      } else {
        explanation = `A great match because you chose ${uniqueReasons[0]}, wanted ${uniqueReasons[1]}, and fits ${uniqueReasons[2]}.`;
      }
    }

    return {
      product,
      score,
      matchPercentage,
      explanation
    };
  });

  // Sort descending
  matches.sort((a, b) => b.matchPercentage - a.matchPercentage);
  
  return matches.slice(0, 3);
}
