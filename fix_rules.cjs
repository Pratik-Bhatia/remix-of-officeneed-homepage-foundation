const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /\{ category: "Computer Peripherals", sub: "Mouse", match: \/\\bmouse\\b\/ \},\s*\{ category: "Computer Peripherals", sub: "Keyboards", match: \/keyboard\/ \},\s*\{ category: "Computer Peripherals", sub: "Printers", match: \/printer\|toner\|cartridge\/ \},\s*/g,
  ""
);

content = content.replace(
  /match: \/bluetooth\|speaker\|headphone\|earph\|headset\|usb\|pen \?drive\|flash drive\|hdd\|ssd\|hard disk\|sd card\|jbl\|cable\|charger\|adapter\|dock\|webcam\|monitor\|router\|laptop\|power bank\//,
  "match: /mouse|keyboard|printer|toner|cartridge|bluetooth|speaker|headphone|earph|headset|usb|pen ?drive|flash drive|hdd|ssd|hard disk|sd card|jbl|cable|charger|adapter|dock|webcam|monitor|router|laptop|power bank/"
);

fs.writeFileSync(path, content);
console.log("Updated shopify-overlay.ts classification rules.");
