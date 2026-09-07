const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /\{ category: "Computer Peripherals", sub: "Computer Accessories", match: \/mouse\|keyboard\|printer\|toner\|cartridge\|bluetooth\|speaker\|headphone\|earph\|headset\|usb\|pen \?drive\|flash drive\|hdd\|ssd\|hard disk\|sd card\|jbl\|cable\|charger\|adapter\|dock\|webcam\|monitor\|router\|laptop\|power bank\/ \},/,
  `{ category: "Computer Peripherals", sub: "Computer Accessories", match: /mouse|keyboard|printer|toner|cartridge|bluetooth|speaker|headphone|earph|headset|jbl|webcam|monitor|laptop|dock/ },
  { category: "Computer Peripherals", sub: "Cables & Adapters", match: /cable|charger|adapter|usb|power bank/ },
  { category: "Computer Peripherals", sub: "Storage Devices", match: /pen ?drive|flash drive|hdd|ssd|hard disk|sd card/ },
  { category: "Computer Peripherals", sub: "Other Hardware", match: /router/ },`
);

fs.writeFileSync(path, content);
console.log("Updated shopify-overlay.ts classification rules properly.");
