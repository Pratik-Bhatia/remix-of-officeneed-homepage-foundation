const fs = require("fs");
const text = fs.readFileSync("src/lib/enquiries.functions.ts", "utf8");
const start = text.indexOf('pdfBuffer');
console.log(text.slice(start - 200, start + 1500));
