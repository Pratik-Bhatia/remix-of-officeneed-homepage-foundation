const fs = require("fs");
let content = fs.readFileSync("src/routes/products.index.tsx", "utf8");

// Remove breadcrumb div block
const breadcrumbRegex = /<div className="text-sm text-muted-foreground mb-6 flex items-center gap-2">.*?<\/div>/s;
content = content.replace(breadcrumbRegex, "");

// Remove paragraph description block
const pRegex = /<p className="mt-4 text-sm sm:text-base leading-relaxed text-muted-foreground">.*?<\/p>/s;
content = content.replace(pRegex, "");

fs.writeFileSync("src/routes/products.index.tsx", content);
console.log("Removed breadcrumbs and description.");
