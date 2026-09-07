const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let text = fs.readFileSync(path, "utf8");

if (!text.includes('profile.ai_subtitle =')) {
  text = text.replace(
    'hasData = true;',
    `hasData = true;
        if (m.key === "ai_subtitle") {
          profile.ai_subtitle = m.value;
        }`
  );
  fs.writeFileSync(path, text);
  console.log("Updated parseFragranceProfile");
}
