const fs = require("fs");
const path = "src/lib/taxonomy.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /"Office Stationery":\s*\{\s*title:\s*"Office Stationery",[\s\S]*?\},(?=\s*"Computer Peripherals":)/,
  `"Office Stationery": {
    title: "Office Stationery",
    id: "gid://shopify/Collection/498084806884",
    handle: null,
    subcategories: {
      "Files and Folders": { title: "Files and Folders", id: null, handle: null },
      "Printing Papers": { title: "Printing Papers", id: null, handle: null },
      "Staplers and Punching": { title: "Staplers and Punching", id: null, handle: null },
      "Pen": { title: "Pen", id: null, handle: null }
    }
  },`
);

fs.writeFileSync(path, content);
console.log("Updated Office Stationery taxonomy successfully this time.");
