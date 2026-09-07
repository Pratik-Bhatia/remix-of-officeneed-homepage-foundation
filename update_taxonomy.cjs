const fs = require("fs");
const path = "src/lib/taxonomy.ts";
let content = fs.readFileSync(path, "utf8");

const newFunc = `export function getCategoryByTitle(title: string): { parentTitle?: string; node: CollectionMapping } | null {
  for (const main of Object.values(TAXONOMY)) {
    if (main.title === title) return { node: main };
    for (const sub of Object.values(main.subcategories)) {
      if (sub.title === title) return { parentTitle: main.title, node: sub };
    }
  }
  return null;
}
`;

content = content + "\n" + newFunc;
fs.writeFileSync(path, content);
console.log("Added getCategoryByTitle to taxonomy.ts");
