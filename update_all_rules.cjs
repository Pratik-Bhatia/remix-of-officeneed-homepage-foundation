const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

const newRules = `const RULES: Rule[] = [
  { category: "Officeneed Exclusive", sub: "Featured Exclusives", match: /featured exclusive/ },
  { category: "Officeneed Exclusive", sub: "New Exclusives", match: /new exclusive/ },
  { category: "Corporate Gifting", sub: "Premium Gifts", match: /premium gift/ },
  { category: "Corporate Gifting", sub: "Customized Gifts", match: /customized gift|custom gift/ },
  { category: "Fragrance Gifting", sub: "Perfume Gift Sets", match: /perfume gift set|fragrance gift set|perfume set/ },
  { category: "Fragrance Gifting", sub: "Middle Eastern Perfume", match: /attar|oud|arab|middle east/ },
  { category: "Fragrance Gifting", sub: "European Perfume", match: /perfum|fragranc|eau de|deodor|cologne/ },
  { category: "Computer Peripherals", sub: "Computer Accessories", match: /mouse|keyboard|printer|toner|cartridge|bluetooth|speaker|headphone|earph|headset|jbl|webcam|monitor|laptop|dock/ },
  { category: "Computer Peripherals", sub: "Cables & Adapters", match: /cable|charger|adapter|usb|power bank/ },
  { category: "Computer Peripherals", sub: "Storage Devices", match: /pen ?drive|flash drive|hdd|ssd|hard disk|sd card/ },
  { category: "Computer Peripherals", sub: "Other Hardware", match: /router/ },
  { category: "Printing & Branding", sub: "Custom Printing", match: /printing|branding|banner|business card|visiting card|letterhead|brochure/ },
  { category: "Office Stationery", sub: "Files and Folders", match: /sheet protector/ },
  { category: "Corporate Gifting", sub: "Corporate Gifts", match: /corporate gift|gift set|hamper|gifting/ },
  { category: "Corporate Gifting", sub: "Drinkware & Utensils", match: /bottle|flask|mug|tumbler|borosil|drinkware|lunch box|casserole/ },
  { category: "Hidden" as any, sub: "Hidden", match: /notebook|notepad|diary|register|journal|wiro book/ },
  { category: "Office Stationery", sub: "Staplers and Punching", match: /stapler|punch|staple|hole punch/ },
  { category: "Office Stationery", sub: "Files and Folders", match: /file|folder|binder|document case|portfolio/ },
  { category: "Office Stationery", sub: "Printing Papers", match: /copier paper|printing paper|printer paper|bond paper|photocopy|a4 paper|a3 paper|rim|excel bond/ },
  { category: "Office Stationery", sub: "Pen", match: /\\bpen\\b|pencil|marker|highlighter|sketch pen|refill|ball ?point/ },
];`;

content = content.replace(/const RULES: Rule\[\] = \[[\s\S]*?\];/, newRules);

fs.writeFileSync(path, content);
console.log("Updated RULES array with missing categories.");
