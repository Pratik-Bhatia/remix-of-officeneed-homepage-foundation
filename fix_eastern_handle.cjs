const fs = require("fs");
const path = "src/lib/taxonomy.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /"Middle Eastern Perfume": \{ title: "Middle Eastern Perfume", id: null, handle: "middle-eastern-perfume" \}/,
  '"Middle Eastern Perfume": { title: "Middle Eastern Perfume", id: "gid://shopify/Collection/315489550429", handle: "eastern-perfume" }'
);

fs.writeFileSync(path, content);
console.log("Updated taxonomy.ts with correct eastern-perfume handle");
