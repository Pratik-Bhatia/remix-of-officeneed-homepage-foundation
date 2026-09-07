const haystack = "worldone expanding file folder with handle and lock 13 indexed pocket for document worldone expanding file is a durable and practical document storage solution designed for organizing and carrying importan file and folder stationery";

const rules = [
  { category: "Fragrance Gifting", sub: "Perfume Gift Sets", match: /perfume gift set|fragrance gift set|perfume set/ },
  { category: "Fragrance Gifting", sub: "Middle Eastern Perfume", match: /attar|oud|arab|middle east/ },
  { category: "Fragrance Gifting", sub: "European Perfume", match: /perfum|fragranc|eau de|deodor|cologne/ },
  { category: "Computer Peripherals", sub: "Computer Accessories", match: /mouse|keyboard|printer|toner|cartridge|bluetooth|speaker|headphone|earph|headset|jbl|webcam|monitor|laptop|dock/ },
  { category: "Computer Peripherals", sub: "Cables & Adapters", match: /cable|charger|adapter|usb|power bank/ },
  { category: "Computer Peripherals", sub: "Storage Devices", match: /pen ?drive|flash drive|hdd|ssd|hard disk|sd card/ },
  { category: "Computer Peripherals", sub: "Other Hardware", match: /router/ },
  { category: "Printing & Branding", sub: "Custom Printing", match: /printing|branding|banner|business card|visiting card|letterhead|brochure/ },
  { category: "Corporate Gifting", sub: "Corporate Gifts", match: /corporate gift|gift set|hamper|gifting/ },
  { category: "Corporate Gifting", sub: "Drinkware & Utensils", match: /bottle|flask|mug|tumbler|borosil|drinkware|lunch box|casserole/ },
  { category: "Office Stationery", sub: "Pen", match: /\bpen\b|pencil|marker|highlighter|sketch pen|refill|ball ?point/ },
  { category: "Office Stationery", sub: "Notebooks & Notepads", match: /notebook|notepad|diary|register|journal/ },
  { category: "Office Stationery", sub: "Staplers and Punching", match: /stapler|punch|staple|hole punch/ },
  { category: "Office Stationery", sub: "Files and Folders", match: /file|folder|binder|document case|portfolio|sheet protector/ },
  { category: "Office Stationery", sub: "Printing Papers", match: /copier paper|printing paper|printer paper|bond paper|photocopy|a4 paper|a3 paper|rim|excel bond/ },
];

for (const rule of rules) {
  if (rule.match.test(haystack)) {
    console.log("Matched:", rule.sub);
    break;
  }
}
