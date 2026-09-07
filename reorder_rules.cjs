const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

// We need to move the Office Stationery rules above the Corporate Gifting rules
const stationeryRules = `  { category: "Office Stationery", sub: "Pen", match: /\\bpen\\b|pencil|marker|highlighter|sketch pen|refill|ball \\?point/ },
  { category: "Office Stationery", sub: "Notebooks & Notepads", match: /notebook|notepad|diary|register|journal/ },
  { category: "Office Stationery", sub: "Staplers and Punching", match: /stapler|punch|staple|hole punch/ },
  { category: "Office Stationery", sub: "Files and Folders", match: /file|folder|binder|document case|portfolio|sheet protector/ },
  { category: "Office Stationery", sub: "Printing Papers", match: /copier paper|printing paper|printer paper|bond paper|photocopy|a4 paper|a3 paper|rim|excel bond/ },`;

const giftingRules = `  { category: "Corporate Gifting", sub: "Corporate Gifts", match: /corporate gift|gift set|hamper|gifting/ },
  { category: "Corporate Gifting", sub: "Drinkware & Utensils", match: /bottle|flask|mug|tumbler|borosil|drinkware|lunch box|casserole/ },`;

// Strip them out first
content = content.replace(stationeryRules, "");
content = content.replace(giftingRules, "");

// Re-insert them in the correct order (Stationery first, then Gifting)
const placeholder = `  { category: "Printing & Branding", sub: "Custom Printing", match: /printing|branding|banner|business card|visiting card|letterhead|brochure/ },`;

content = content.replace(
  placeholder,
  `${placeholder}\n${stationeryRules}\n${giftingRules}`
);

// Cleanup empty lines
content = content.replace(/\n\s*\n\s*\n/g, "\n\n");

fs.writeFileSync(path, content);
console.log("Reordered rules successfully.");
