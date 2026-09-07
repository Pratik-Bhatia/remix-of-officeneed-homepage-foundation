const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /CheckCircle2, Gift, Briefcase, Sparkles, Laptop, Printer \} from "lucide-react";/,
  'CheckCircle2, Gift, Briefcase, Sparkles, Laptop, Printer, Droplets } from "lucide-react";'
);

content = content.replace(
  /"Printing & Branding": Printer,/,
  '"Fragrance Gifting": Droplets,'
);

fs.writeFileSync(path, content);
console.log("Updated ChatWidget.tsx");
