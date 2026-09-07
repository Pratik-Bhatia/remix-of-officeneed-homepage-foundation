const fs = require("fs");
const path = "src/lib/taxonomy.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /"European Perfume": \{ title: "European Perfume", id: null, handle: "european-perfume" \}/,
  '"European Perfume": { title: "European Perfume", id: "gid://shopify/Collection/315489419357", handle: "european-perfume" }'
);

fs.writeFileSync(path, content);
console.log("Updated taxonomy.ts with correct european-perfume ID");
