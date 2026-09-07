const fs = require("fs");
const path = "src/routes/products.index.tsx";
let content = fs.readFileSync(path, "utf8");

const findStr = `Object.values(TAXONOMY[taxonomyMatch.node.title as MainCategory].subcategories).map((sub: any) => {
                  if (!sub.handle) return null;`;

const replaceStr = `Object.values(TAXONOMY[taxonomyMatch.node.title as MainCategory].subcategories).map((sub: any) => {
                  // if (!sub.handle) return null;`;

if (content.includes(findStr)) {
  content = content.replace(findStr, replaceStr);
  fs.writeFileSync(path, content);
  console.log("Removed handle check for subcategories.");
} else {
  console.error("Could not find the string to replace. Attempting fallback regex...");
  const fallback = content.replace(/Object\.values\(TAXONOMY\[taxonomyMatch\.node\.title as MainCategory\]\.subcategories\)\.map\(\(sub:\s*any\)\s*=>\s*\{\s*if\s*\(!sub\.handle\)\s*return\s*null;/g, `Object.values(TAXONOMY[taxonomyMatch.node.title as MainCategory].subcategories).map((sub: any) => {`);
  if (fallback !== content) {
    fs.writeFileSync(path, fallback);
    console.log("Removed handle check for subcategories (using regex).");
  } else {
    console.error("Failed completely.");
  }
}
