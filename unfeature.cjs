const fs = require("fs");
let content = fs.readFileSync("src/lib/navigation.ts", "utf8");

content = content.replace("featured: true,", "");

fs.writeFileSync("src/lib/navigation.ts", content);
console.log("Removed featured flag from navigation.ts");
