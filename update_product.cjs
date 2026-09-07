const fs = require("fs");
let content = fs.readFileSync("src/lib/products.ts", "utf8");

content = content.replace(
  'features?: string[];',
  `features?: string[];
  materials?: string[];
  dimensions?: string;
  careInstructions?: string;
  fragranceNotes?: { top?: string; heart?: string; base?: string };
  ingredients?: string;
  compatibility?: string;
  whatsIncluded?: string[];
  customSections?: Array<{ title: string; contentHtml: string }>;`
);

fs.writeFileSync("src/lib/products.ts", content);
console.log("Updated Product interface in products.ts.");
