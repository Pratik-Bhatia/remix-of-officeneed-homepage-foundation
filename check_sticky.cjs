const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

if (content.includes("Sticky Purchase Bar")) {
  console.log("Sticky bar IS present.");
} else {
  console.log("Sticky bar is MISSING.");
}
