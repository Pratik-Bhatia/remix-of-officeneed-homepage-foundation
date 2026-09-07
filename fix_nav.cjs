const fs = require("fs");
const path = "src/lib/navigation.ts";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /"Fragrance Gifting": \{ collection: TAXONOMY\["Fragrance Gifting"\].handle! \},/g,
  '"Fragrance Gifting": { collection: TAXONOMY["Fragrance Gifting"].handle! },\n  "Fragrance & Luxury Gifting": { collection: TAXONOMY["Fragrance Gifting"].handle! },'
);

fs.writeFileSync(path, text);
console.log("Updated navigation.ts");
