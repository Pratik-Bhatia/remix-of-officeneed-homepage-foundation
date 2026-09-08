const token = "REMOVED_TOKEN";
const domain = "har1k4-di.myshopify.com";

const query = `
{
  products(first: 60) {
    edges {
      node {
        title
        productType
        vendor
        description
        tags
      }
    }
  }
}
`;

const RULES = [
  { category: "Fragrance Gifting", sub: "Perfume Gift Sets", match: /perfume gift set|fragrance gift set|perfume set/ },
  { category: "Fragrance Gifting", sub: "Middle Eastern Perfume", match: /attar|oud|arab|middle east/ },
  { category: "Fragrance Gifting", sub: "European Perfume", match: /perfum|fragranc|eau de|deodor|cologne/ },
  { category: "Computer Peripherals", sub: "Computer Accessories", match: /mouse|keyboard|printer|toner|cartridge|bluetooth|speaker|headphone|earph|headset|jbl|webcam|monitor|laptop|dock/ },
  { category: "Computer Peripherals", sub: "Cables & Adapters", match: /cable|charger|adapter|usb|power bank/ },
  { category: "Computer Peripherals", sub: "Storage Devices", match: /pen ?drive|flash drive|hdd|ssd|hard disk|sd card/ },
  { category: "Computer Peripherals", sub: "Other Hardware", match: /router/ },
  { category: "Printing & Branding", sub: "Custom Printing", match: /printing|branding|banner|business card|visiting card|letterhead|brochure/ },
  { category: "Office Stationery", sub: "Pen", match: /\bpen\b|pencil|marker|highlighter|sketch pen|refill|ball ?point/ },
  { category: "Office Stationery", sub: "Notebooks & Notepads", match: /notebook|notepad|diary|register|journal/ },
  { category: "Office Stationery", sub: "Staplers and Punching", match: /stapler|punch|staple|hole punch/ },
  { category: "Office Stationery", sub: "Files and Folders", match: /file|folder|binder|document case|portfolio|sheet protector/ },
  { category: "Office Stationery", sub: "Printing Papers", match: /copier paper|printing paper|printer paper|bond paper|photocopy|a4 paper|a3 paper|rim|excel bond/ },
  { category: "Corporate Gifting", sub: "Corporate Gifts", match: /corporate gift|gift set|hamper|gifting/ },
  { category: "Corporate Gifting", sub: "Drinkware & Utensils", match: /bottle|flask|mug|tumbler|borosil|drinkware|lunch box|casserole/ },
];

const normalize = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function classify(node) {
  if (node.tags && node.tags.length > 0) {
    for (const rule of RULES) {
      if (node.tags.some(tag => tag.toLowerCase() === rule.sub.toLowerCase())) {
        return { type: "tag", sub: rule.sub };
      }
    }
  }

  const haystack = normalize(
    [node.title, node.productType, node.vendor, node.description?.slice(0, 120), ...(node.tags || [])]
      .filter(Boolean)
      .join(" "),
  );
  
  for (const rule of RULES) {
    if (rule.match.test(haystack)) return { type: "regex", sub: rule.sub };
  }
  return { type: "fallback", sub: "Pen" };
}

fetch(`https://${domain}/api/2025-07/graphql.json`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Storefront-Access-Token": token,
  },
  body: JSON.stringify({ query })
})
.then(res => res.json())
.then(json => {
  const nodes = json.data.products.edges.map(e => e.node);
  const matched = nodes.filter(n => classify(n).sub === "Files and Folders");
  console.log(`Found ${matched.length} products mapped to Files and Folders:`);
  matched.forEach(t => console.log(t.title));
})
.catch(err => console.error(err));
