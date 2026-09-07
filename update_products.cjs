const fs = require("fs");
const path = "src/lib/products.ts";
let content = fs.readFileSync(path, "utf8");

const replacement = `  price?: string;
  /** True when \`price\` is a starting/from price */
  fragranceProfile?: {
    notes?: string[];
    occasion?: string[];
    personality?: string[];
    mood?: string[];
    intensity?: string;
    weather?: string[];
    time_of_day?: string[];
    recipient?: string[];
    age_group?: string[];
    corporate?: boolean;
    gift_suitable?: boolean;
  };`;

content = content.replace(/  price\?: string;\s+\/\*\* True when `price` is a starting\/from price \*\//, replacement);

fs.writeFileSync(path, content);
console.log("Updated products.ts");
