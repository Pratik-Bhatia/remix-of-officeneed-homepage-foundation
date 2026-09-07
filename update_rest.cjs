const fs = require("fs");
let p1 = "src/components/officeneed/ChatWidget.tsx";
let p2 = "src/lib/chat-flow.ts";
let p3 = "src/routes/faqs.tsx";
let p4 = "src/routes/shop.index.tsx";

[p1, p2, p3, p4].forEach(p => {
  let content = fs.readFileSync(p, "utf8");
  content = content.replace(/Office Supplies/g, 'Office Stationery');
  fs.writeFileSync(p, content);
});
console.log("Updated rest of references");
