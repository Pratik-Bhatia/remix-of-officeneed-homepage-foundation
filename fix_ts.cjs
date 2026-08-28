const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

content = content.replace(
  'if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {',
  'if (entry && !entry.isIntersecting && entry.boundingClientRect.top < 0) {'
);

fs.writeFileSync("src/routes/products.$slug.tsx", content);
