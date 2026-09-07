const fs = require("fs");
const path = require("path");

function replaceInFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, "utf8");
  let modified = false;
  for (const [search, replace] of replacements) {
    if (content.includes(search)) {
      content = content.replaceAll(search, replace);
      modified = true;
    }
  }
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  }
}

const files = [
  "src/components/officeneed/Footer.tsx",
  "src/lib/bestsellers.ts",
  "src/lib/navigation.ts",
  "src/lib/shopify-overlay.ts",
  "src/lib/taxonomy.ts",
  "src/routes/products.index.tsx",
  "src/components/officeneed/ChatWidget.tsx",
  "src/lib/chat-flow.ts",
  "src/lib/filters.ts",
  "src/lib/products.ts",
  "src/routes/contact-us.tsx",
  "src/routes/terms-and-conditions.tsx"
];

const replacements = [
  ["Hardware Supplies", "Computer Peripherals"],
  ["Hardware & IT", "Computer Peripherals"],
  ["hardware & IT", "computer peripherals"]
];

for (const file of files) {
  if (fs.existsSync(file)) {
    replaceInFile(file, replacements);
  }
}
