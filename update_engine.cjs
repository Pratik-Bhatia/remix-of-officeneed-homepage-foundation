const fs = require("fs");
const path = "src/lib/fragrance-engine.ts";
let text = fs.readFileSync(path, "utf8");

const fallbackLogic = `
    let profile = product.fragranceProfile;

    if (!profile) {
      const desc = (product.description || "").toLowerCase();
      const tags = (product.tags || []).map(t => t.toLowerCase());
      
      profile = {
        notes: ["Floral", "Citrus", "Woody", "Spicy", "Fresh", "Sweet", "Fruity", "Musk", "Oriental", "Aquatic"].filter(n => desc.includes(n.toLowerCase()) || tags.some(t => t.includes(n.toLowerCase()))),
        occasion: ["Everyday / Daily Wear", "Office / Professional", "Casual Outings", "Date Night", "Party / Night Out", "Formal / Special Occasion", "Travel / Vacation"].filter(o => desc.includes(o.split(' / ')[0].toLowerCase()) || tags.some(t => t.includes(o.split(' / ')[0].toLowerCase()))),
        recipient: ["Men", "Women", "Unisex"].filter(r => desc.includes(r.toLowerCase()) || tags.some(t => t.includes(r.toLowerCase()))),
        personality: ["Fresh & Energetic", "Calm & Sophisticated", "Bold & Confident", "Romantic & Charming", "Mysterious & Magnetic", "Playful & Adventurous"].filter(p => desc.includes(p.split(' ')[0].toLowerCase()) || tags.some(t => t.includes(p.split(' ')[0].toLowerCase()))),
        mood: ["Fresh & Uplifting", "Calm & Relaxed", "Confident & Powerful", "Romantic & Sensual", "Elegant & Refined", "Warm & Comforting"].filter(m => desc.includes(m.split(' ')[0].toLowerCase()) || tags.some(t => t.includes(m.split(' ')[0].toLowerCase()))),
        intensity: ["Subtle", "Balanced", "Bold"].find(i => desc.includes(i.toLowerCase()) || tags.some(t => t.includes(i.toLowerCase()))),
        weather: ["Hot", "Warm", "Cool", "Cold", "All Weather"].filter(w => desc.includes(w.toLowerCase()) || tags.some(t => t.includes(w.toLowerCase()))),
        time_of_day: ["Morning", "Daytime", "Evening", "Night", "All Day"].filter(td => desc.includes(td.toLowerCase()) || tags.some(t => t.includes(td.toLowerCase()))),
        age_group: ["18-24", "25-34", "35-44", "45+"].filter(a => desc.includes(a) || tags.some(t => t.includes(a))),
      };
      
      // If we synthesized it but found absolutely nothing, give it a tiny base score just so it exists
      if (!profile.notes.length && !profile.occasion.length && !profile.recipient.length) {
         return { product, score: 0.1, matchPercentage: 10, explanation: "One of our classic fragrances." };
      }
    }
`;

text = text.replace(
  /const profile = product\.fragranceProfile;\s*if \(\!profile\) \{\s*\/\/ If a product lacks a profile completely, we give it a tiny base score just so it can show up if the catalog is empty\s*return \{ product, score: 0\.1, matchPercentage: 10, explanation: "One of our classic fragrances\." \};\s*\}/,
  fallbackLogic
);

fs.writeFileSync(path, text);
console.log("Updated fragrance-engine logic");
