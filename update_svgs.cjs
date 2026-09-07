const fs = require("fs");
const path = "src/components/officeneed/FragranceQuiz.tsx";
let text = fs.readFileSync(path, "utf8");

// 1. Replace the old imports with the new SVG imports
text = text.replace(
  /import type \{ Product \} from "@\/lib\/products";[\s\S]*?import \{ Flower2 \} from "lucide-react";/,
  `import type { Product } from "@/lib/products";
import aquaticIcon from "@/assets/fragrance/Aquatic.svg";
import floralIcon from "@/assets/fragrance/flower.svg";
import freshIcon from "@/assets/fragrance/Fresh.svg";
import fruityIcon from "@/assets/fragrance/Fruity.svg";
import citrusIcon from "@/assets/fragrance/lemon.svg";
import muskyIcon from "@/assets/fragrance/Musky.svg";
import oudIcon from "@/assets/fragrance/oud.svg";
import spicyIcon from "@/assets/fragrance/spicy.svg";
import sweetIcon from "@/assets/fragrance/sweet.svg";
import woodyIcon from "@/assets/fragrance/wood.svg";`
);

// 2. Replace the NOTES array
const oldNotesRegex = /const NOTES = \[[\s\S]*?\];/;
const newNotes = `const NOTES = [
  { id: "Woody", image: woodyIcon },
  { id: "Floral", image: floralIcon },
  { id: "Citrus", image: citrusIcon },
  { id: "Fresh", image: freshIcon },
  { id: "Fruity", image: fruityIcon },
  { id: "Musky", image: muskyIcon },
  { id: "Spicy", image: spicyIcon },
  { id: "Sweet", image: sweetIcon },
  { id: "Aquatic", image: aquaticIcon },
  { id: "Oud", image: oudIcon },
];`;
text = text.replace(oldNotesRegex, newNotes);

fs.writeFileSync(path, text);
console.log("Updated NOTES with SVGs!");
