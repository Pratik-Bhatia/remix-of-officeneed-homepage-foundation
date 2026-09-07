const fs = require("fs");
const path = "src/routes/products.index.tsx";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-3"/,
  'className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4 lg:grid-cols-4"'
);

fs.writeFileSync(path, content);
console.log("Updated products.index.tsx");
