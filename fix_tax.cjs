const fs = require("fs");
const path = "src/lib/taxonomy.ts";
let content = fs.readFileSync(path, "utf8");

const findStr = `    subcategories: {
      "Computer Accessories": { title: "Computer Accessories", id: null, handle: null },
      "Cables & Adapters": { title: "Cables & Adapters", id: null, handle: null },
      "Storage Devices": { title: "Storage Devices", id: null, handle: null },
      "Mobile Accessories": { title: "Mobile Accessories", id: null, handle: null },
      "Power & Charging": { title: "Power & Charging", id: null, handle: null },
      "Networking Accessories": { title: "Networking Accessories", id: null, handle: null },
      "Other Hardware": { title: "Other Hardware", id: null, handle: null },
    }`;

const replaceStr = `    subcategories: {
      "Computer Accessories": { title: "Computer Accessories", id: null, handle: null },
      "Cables & Adapters": { title: "Cables & Adapters", id: null, handle: null },
      "Storage Devices": { title: "Storage Devices", id: null, handle: null },
      "Other Hardware": { title: "Other Hardware", id: null, handle: null },
    }`;

content = content.replace(findStr, replaceStr);
fs.writeFileSync(path, content);
console.log("Removed unused subcategories from taxonomy.ts");
