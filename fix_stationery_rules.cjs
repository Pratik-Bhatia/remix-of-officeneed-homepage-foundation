const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /\{\s*category:\s*"Office Stationery",\s*sub:\s*"Printing Papers",\s*match:\s*\/paper\|a4\|rim\|copier\|printing paper\|photocopy\/\s*\}/g,
  '{ category: "Office Stationery", sub: "Printing Papers", match: /copier paper|printing paper|printer paper|bond paper|photocopy|a4 paper|a3 paper|rim|excel bond/ }'
);

content = content.replace(
  /\{\s*category:\s*"Office Stationery",\s*sub:\s*"Files and Folders",\s*match:\s*\/file\|folder\|binder\|document case\|portfolio\/\s*\}/g,
  '{ category: "Office Stationery", sub: "Files and Folders", match: /file|folder|binder|document case|portfolio|sheet protector/ }'
);

// We need to add Notebooks back to the rules so they don't fall back to Pen or Office Stationery default
const penRule = `{ category: "Office Stationery", sub: "Pen", match: /\\bpen\\b|pencil|marker|highlighter|sketch pen|refill|ball ?point/ },`;
const notebookRule = `  { category: "Office Stationery", sub: "Notebooks & Notepads", match: /notebook|notepad|diary|register|journal/ },`;
content = content.replace(penRule, `${penRule}\n${notebookRule}`);

fs.writeFileSync(path, content);
console.log("Updated regex rules for Printing Papers and Files and Folders.");
