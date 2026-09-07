const fs = require("fs");
const path = "src/components/officeneed/FragranceQuiz.tsx";
let text = fs.readFileSync(path, "utf8");

// Add imports for the images
if (!text.includes('import citrusIcon from "@/assets/fragrance/citrus.png"')) {
  text = text.replace(
    'import { Product } from "@/lib/products";',
    'import { Product } from "@/lib/products";\nimport citrusIcon from "@/assets/fragrance/citrus.png";\nimport woodyIcon from "@/assets/fragrance/woody.png";\nimport { Flower2 } from "lucide-react";'
  );
}

// Update the NOTES array to use the images.
// Currently it has { id: "Woody", icon: "??" }
text = text.replace(
  '{ id: "Woody", icon: "??" }',
  '{ id: "Woody", image: woodyIcon, icon: "??" }'
);
text = text.replace(
  '{ id: "Floral", icon: "??" }',
  '{ id: "Floral", LucideIcon: Flower2, icon: "??" }'
);
text = text.replace(
  '{ id: "Citrus", icon: "??" }',
  '{ id: "Citrus", image: citrusIcon, icon: "??" }'
);

// Update the rendering logic in "notes" step
const oldRender = `<span className="text-2xl">{note.icon}</span>`;
const newRender = `{note.image ? (
                        <img src={note.image} alt={note.id} className="w-8 h-8 object-contain opacity-80" />
                      ) : note.LucideIcon ? (
                        <note.LucideIcon className="w-8 h-8 opacity-80" strokeWidth={1.5} />
                      ) : (
                        <span className="text-2xl">{note.icon}</span>
                      )}`;

text = text.replace(oldRender, newRender);

fs.writeFileSync(path, text);
console.log("Updated NOTES with images");
