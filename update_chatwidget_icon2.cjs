const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  `                      const iconMap: Record<string, any> = {
                        "Corporate Gifting": Gift,
                        "Employee Joining Kits": Briefcase,
                        "Festive Gifts": Sparkles,
                        "Office Supplies": Paperclip,
                        "Hardware & IT": Laptop,
                        "Printing & Branding": Printer,
                      };`,
  `                      const iconMap: Record<string, any> = {
                        "Corporate Gifting": Gift,
                        "Fragrance Gifting": Sparkles,
                        "Employee Joining Kits": Briefcase,
                        "Festive Gifts": Sparkles,
                        "Office Supplies": Paperclip,
                        "Hardware & IT": Laptop,
                        "Printing & Branding": Printer,
                      };`
);

fs.writeFileSync(path, text);
console.log("Added Fragrance Gifting icon");
