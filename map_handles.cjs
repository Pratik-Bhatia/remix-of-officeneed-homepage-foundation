const fs = require("fs");
const path = "src/lib/taxonomy.ts";
let content = fs.readFileSync(path, "utf8");

const findStr1 = `  "Computer Peripherals": {
    title: "Computer Peripherals",
    id: "gid://shopify/Collection/498085003492",
    handle: "hardware",`;

const replaceStr1 = `  "Computer Peripherals": {
    title: "Computer Peripherals",
    id: "gid://shopify/Collection/315531755613",
    handle: "computer-accessories",`;

const findStr2 = `"Computer Accessories": { title: "Computer Accessories", id: null, handle: null },`;
const replaceStr2 = `"Computer Accessories": { title: "Computer Accessories", id: "gid://shopify/Collection/315533361245", handle: "computer-accessories-1" },`;

content = content.replace(findStr1, replaceStr1);
content = content.replace(findStr2, replaceStr2);

fs.writeFileSync(path, content);
console.log("Updated taxonomy with actual Shopify handles.");
