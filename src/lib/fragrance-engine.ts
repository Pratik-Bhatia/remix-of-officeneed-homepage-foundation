import type { Product } from "./products";

export type FragranceQuizAnswers = {
  recipient_type?: "For Myself" | "For Someone Else" | "Not Sure";
  gender?: "Men's fragrance" | "Women's fragrance" | "Unisex fragrance" | "Man" | "Woman" | "Unisex / Anyone" | "Not Sure";
  age_group?: "18-24" | "25-34" | "35-44" | "45+" | "Prefer not to say";
  personality?: "Fresh & Energetic" | "Calm & Sophisticated" | "Bold & Confident" | "Romantic & Charming" | "Mysterious & Magnetic" | "Playful & Adventurous";
  mood?: "Fresh & Uplifting" | "Calm & Relaxed" | "Confident & Powerful" | "Romantic & Sensual" | "Elegant & Refined" | "Warm & Comforting";
  notes?: string[];
  intensity?: "Subtle" | "Balanced" | "Bold" | "Not Sure";
  occasion?: string[];
  weather?: "Hot / Summer" | "Warm / Spring" | "Cool / Autumn" | "Cold / Winter" | "All Season" | "Not Sure";
  time_of_day?: "Morning" | "Daytime" | "Evening" | "Night" | "Any Time" | "Not Sure";
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
  const eligibleProducts = products.filter(p => p.category === "Fragrance Gifting" || p.subcategories?.includes("Perfume Gift Sets") || p.subcategories?.includes("European Perfume") || p.subcategories?.includes("Middle Eastern Perfume"));

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
      if (!profile.notes.length && !profile.occasion.length && !profile.recipient.length) {
         return { product, score: 0.1, matchPercentage: 10, explanation: "One of our classic fragrances." };
      }
    }


    // 1. Notes (25%)
    if (answers.notes && answers.notes.length > 0 && !answers.notes.includes("Not Sure")) {
      maxPossibleScore += 25;
      const matchingNotes = arrayIntersect(answers.notes, profile.notes);
      if (matchingNotes > 0) {
        // Boost if it hits multiple, don't penalize if the product has extra notes
        const noteScore = Math.min(25, (matchingNotes / answers.notes.length) * 25);
        score += noteScore;
        matchedReasons.push(answers.notes.join(", ") + " notes");
      }
    }

    // 2. Occasion (15%)
    if (answers.occasion && answers.occasion.length > 0 && !answers.occasion.includes("Not Sure")) {
      maxPossibleScore += 15;
      const matchingOccasion = arrayIntersect(answers.occasion, profile.occasion);
      if (matchingOccasion > 0) {
        score += 15;
        matchedReasons.push(answers.occasion[0] + " use");
      }
    }

    // 3. Recipient/Gender (15%)
    if (answers.gender && answers.gender !== "Not Sure" && profile.recipient) {
      maxPossibleScore += 15;
      const mapped = GENDER_MAP[answers.gender] || answers.gender;
      if (profile.recipient.includes(mapped) || profile.recipient.includes("Unisex")) {
        score += 15;
      }
    }

    // 4. Personality (10%)
    if (answers.personality && profile.personality) {
      maxPossibleScore += 10;
      if (profile.personality.some(p => answers.personality?.toLowerCase().includes(p.toLowerCase().split(" ")[0] ?? ""))) {
        score += 10;
        matchedReasons.push("a " + answers.personality.toLowerCase() + " vibe");
      }
    }

    // 5. Mood (10%)
    if (answers.mood && profile.mood) {
      maxPossibleScore += 10;
      if (profile.mood.some(m => answers.mood?.toLowerCase().includes(m.toLowerCase().split(" ")[0] ?? ""))) {
        score += 10;
      }
    }

    // 6. Intensity (10%)
    if (answers.intensity && answers.intensity !== "Not Sure" && profile.intensity) {
      maxPossibleScore += 10;
      if (profile.intensity.toLowerCase() === answers.intensity.toLowerCase()) {
        score += 10;
        matchedReasons.push(`a ${answers.intensity.toLowerCase()} presence`);
      }
    }

    // 7. Weather (5%)
    if (answers.weather && answers.weather !== "Not Sure" && profile.weather) {
      maxPossibleScore += 5;
      const w = answers.weather.split(" / ")[0] ?? "";
      if (profile.weather.some(x => x.toLowerCase().includes(w.toLowerCase()) || x === "All Weather")) {
        score += 5;
        matchedReasons.push("matching the climate");
      }
    }

    // 8. Time of Day (5%)
    if (answers.time_of_day && answers.time_of_day !== "Not Sure" && profile.time_of_day) {
      maxPossibleScore += 5;
      if (profile.time_of_day.some(t => t.toLowerCase() === answers.time_of_day?.toLowerCase() || t === "All Day")) {
        score += 5;
      }
    }

    // 9. Age Group (5%)
    if (answers.age_group && answers.age_group !== "Prefer not to say" && profile.age_group) {
      maxPossibleScore += 5;
      if (profile.age_group.includes(answers.age_group)) {
        score += 5;
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
