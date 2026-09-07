const fs = require("fs");
const path = "src/lib/taxonomy.ts";
let content = fs.readFileSync(path, "utf8");

// Remove Exclusive Products
content = content.replace(/"Exclusive Products": \{ title: "Exclusive Products", id: "gid:\/\/shopify\/Collection\/498084970724", handle: "exclusive-products" \},?\s*/, "");

// Update Featured Exclusives and New Exclusives handles
content = content.replace(
  /"Featured Exclusives": \{ title: "Featured Exclusives", id: null, handle: null \}/,
  '"Featured Exclusives": { title: "Featured Exclusives", id: null, handle: "featured-exclusives" }'
);
// note: new-exclusives has handle "exclusive-products" according to output!
// Wait! Let me check the script output again:
// "new-exclusives -> exclusive-products"
// Okay!
content = content.replace(
  /"New Exclusives": \{ title: "New Exclusives", id: null, handle: null \}/,
  '"New Exclusives": { title: "New Exclusives", id: null, handle: "exclusive-products" }'
);

// Update Corporate Gifting
content = content.replace(
  /"Corporate Gifts": \{ title: "Corporate Gifts", id: null, handle: null \}/,
  '"Corporate Gifts": { title: "Corporate Gifts", id: null, handle: "corporate-gifts" }'
);
content = content.replace(
  /"Drinkware & Utensils": \{ title: "Drinkware & Utensils", id: null, handle: null \}/,
  '"Drinkware & Utensils": { title: "Drinkware & Utensils", id: null, handle: "drinkware-utensils" }'
);
content = content.replace(
  /"Customized Gifts": \{ title: "Customized Gifts", id: null, handle: null \}/,
  '"Customized Gifts": { title: "Customized Gifts", id: null, handle: "customized-gifts" }'
);

// Update Office Stationery
content = content.replace(
  /"Files and Folders": \{ title: "Files and Folders", id: null, handle: null \}/,
  '"Files and Folders": { title: "Files and Folders", id: null, handle: "files-and-folders" }'
);
content = content.replace(
  /"Printing Papers": \{ title: "Printing Papers", id: null, handle: null \}/,
  '"Printing Papers": { title: "Printing Papers", id: null, handle: "printing-papers" }'
);
content = content.replace(
  /"Staplers and Punching": \{ title: "Staplers and Punching", id: null, handle: null \}/,
  '"Staplers and Punching": { title: "Staplers and Punching", id: null, handle: "staplers-and-punching" }'
);
content = content.replace(
  /"Pen": \{ title: "Pen", id: null, handle: null \}/,
  '"Pen": { title: "Pen", id: null, handle: "pen" }'
);

// Update Computer Peripherals
content = content.replace(
  /"Cables & Adapters": \{ title: "Cables & Adapters", id: null, handle: null \}/,
  '"Cables & Adapters": { title: "Cables & Adapters", id: null, handle: "cables-and-adapters" }'
);
content = content.replace(
  /"Storage Devices": \{ title: "Storage Devices", id: null, handle: null \}/,
  '"Storage Devices": { title: "Storage Devices", id: null, handle: "storage-devices" }'
);
content = content.replace(
  /"Other Hardware": \{ title: "Other Hardware", id: null, handle: null \}/,
  '"Other Hardware": { title: "Other Hardware", id: null, handle: "other-hardware" }'
);

fs.writeFileSync(path, content);
console.log("Updated taxonomy handles!");
