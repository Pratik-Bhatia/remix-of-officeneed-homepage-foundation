const rules = [
  { category: "Office Stationery", sub: "Files and Folders", match: /sheet protector/ },
  { category: "Corporate Gifting", sub: "Corporate Gifts", match: /corporate gift|gift set|hamper|gifting/ },
  { category: "Corporate Gifting", sub: "Drinkware & Utensils", match: /bottle|flask|mug|tumbler|borosil|drinkware|lunch box|casserole/ },
  { category: "Office Stationery", sub: "Pen", match: /\bpen\b|pencil|marker|highlighter|sketch pen|refill|ball ?point/ },
  { category: "Office Stationery", sub: "Notebooks & Notepads", match: /notebook|notepad|diary|register|journal/ },
  { category: "Office Stationery", sub: "Staplers and Punching", match: /stapler|punch|staple|hole punch/ },
  { category: "Office Stationery", sub: "Files and Folders", match: /file|folder|binder|document case|portfolio/ },
  { category: "Office Stationery", sub: "Printing Papers", match: /copier paper|printing paper|printer paper|bond paper|photocopy|a4 paper|a3 paper|rim|excel bond/ },
];

const titles = [
  "H3139 Premium PU Leather Diary & Metal Pen Gift Set",
  "2 In 1 Gift Set H3118 Cardholder And Pen",
  "H926 Executive 3-in-1 Corporate Gift Set - Notebook Diary, Metal Pen & Keychain Gift Box",
  "3 in 1 Premium Gift Set - A5 PU Leather Diary, Metal Ball Pen & Stainless Steel Water Bottle",
  "Benelux Sheet Protector A/4 , F/c @ A/3 150 Micron Pack Of 50 (tag: Gift Set)",
  "Worldone Expanding File Folder with Handle & Lock 13 Indexed Pocket for Document"
];

const normalize = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

for (const title of titles) {
  const haystack = normalize(title);
  for (const rule of rules) {
    if (rule.match.test(haystack)) {
      console.log(`${title} => ${rule.sub}`);
      break;
    }
  }
}
