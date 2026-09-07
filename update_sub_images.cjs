const fs = require("fs");
let content = fs.readFileSync("src/routes/products.index.tsx", "utf8");

const oldSubImages = `const subcategoryImages: Record<string, string> = {
  "Gift Sets": "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=200&q=75",
  "Corporate Gifts": "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=200&q=75",
};`;

const newSubImages = `const subcategoryImages: Record<string, string> = {
  "Gift Sets": "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=200&q=75",
  "Corporate Gifts": "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=200&q=75",
  "European Perfume": "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=200&q=75",
  "Middle Eastern Perfume": "https://images.unsplash.com/photo-1594035910387-fea477274976?auto=format&fit=crop&w=200&q=75",
  "Perfume Gift Sets": "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?auto=format&fit=crop&w=200&q=75",
};`;

content = content.replace(oldSubImages, newSubImages);
fs.writeFileSync("src/routes/products.index.tsx", content);
console.log("Updated subcategoryImages in products.index.tsx.");
