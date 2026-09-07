const fs = require("fs");
let content = fs.readFileSync("src/lib/taxonomy.ts", "utf8");

content = content.replace(
  '"Premium Gifts": { title: "Premium Gifts", id: null, handle: null }',
  '"Premium Gifts": { title: "Premium Gifts", id: null, handle: "premium-gifts" }'
);

fs.writeFileSync("src/lib/taxonomy.ts", content);
console.log("Updated Premium Gifts mapping.");
