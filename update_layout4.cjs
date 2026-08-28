const fs = require("fs");
let content = fs.readFileSync("src/components/officeneed/InteractiveGiftShowcase.tsx", "utf8");

content = content.replace(/<\/div>\s*<\/div>\s*<div className="pointer-events-none/g, '</div>\n\n      <div className="pointer-events-none');
fs.writeFileSync("src/components/officeneed/InteractiveGiftShowcase.tsx", content);
