const fs = require("fs");
const path = "src/components/officeneed/FragranceQuiz.tsx";
let text = fs.readFileSync(path, "utf8");

const subtitleRegex = /<div className="bg-secondary\/50 p-3 rounded-xl mb-4 text-sm text-muted-foreground border border-secondary">\s*<p className="italic">\{m\.product\.fragranceProfile\?\.ai_subtitle \|\| m\.product\.description\.replace\(\/<\[\^>\]\*\>\?\/gm, ''\)\.substring\(0, 60\) \+ \(m\.product\.description\.length > 60 \? '\.\.\.' : ''\)\}<\/p>\s*<\/div>/g;

text = text.replace(subtitleRegex, "");

fs.writeFileSync(path, text);
console.log("Removed subtitle description block");
