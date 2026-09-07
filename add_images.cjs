const fs = require("fs");
const path = "src/routes/products.index.tsx";
let content = fs.readFileSync(path, "utf8");

const replacement = `const subcategoryImages: Record<string, string> = {
    "Gift Sets": "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=200&q=75",
    "Corporate Gifts": "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=200&q=75",
    "Computer Accessories": "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=200&q=75",
    "Cables & Adapters": "https://images.unsplash.com/photo-1555664424-778a1e5e1b48?auto=format&fit=crop&w=200&q=75",
    "Storage Devices": "https://images.unsplash.com/photo-1597848212624-a19eb35e2651?auto=format&fit=crop&w=200&q=75",
    "Mobile Accessories": "https://images.unsplash.com/photo-1584006682522-dc17d6c0d9ac?auto=format&fit=crop&w=200&q=75",
    "Power & Charging": "https://images.unsplash.com/photo-1610416956637-236b2fb576b5?auto=format&fit=crop&w=200&q=75",
    "Networking Accessories": "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=200&q=75",
    "Other Hardware": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=200&q=75",
  };`;

content = content.replace(/const subcategoryImages: Record<string, string> = \{[\s\S]*?\};/, replacement);

fs.writeFileSync(path, content);
console.log("Updated subcategoryImages.");
