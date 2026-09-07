const fs = require("fs");
const path = "src/lib/chat-flow.ts";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /export const chatSteps: ChatStep\[\] = \[\s*\{\s*id: "purpose",\s*question: "What are you shopping for\?",\s*options: \[\s*"Corporate Gifting",\s*"Employee Joining Kits",\s*"Festive Gifts",\s*"Office Stationery",\s*"Computer Peripherals",\s*"Fragrance & Perfumes",\s*\],\s*\},/,
  `export const chatSteps: ChatStep[] = [
  {
    id: "purpose",
    question: "What are you shopping for?",
    options: [
      "Corporate Gifting",
      "Fragrance Gifting",
      "Office Stationery",
      "Computer Peripherals",
    ],
  },
  {
    id: "corporateOccasion",
    question: "What is the occasion for the gift?",
    options: [
      "Employee Onboarding / Joining Kits",
      "Festive & Seasonal Gifting",
      "Client & Executive Appreciation",
      "Conferences & Corporate Events",
      "General Corporate Gifting"
    ],
  },`
);

fs.writeFileSync(path, text);

const widgetPath = "src/components/officeneed/ChatWidget.tsx";
let widget = fs.readFileSync(widgetPath, "utf8");
widget = widget.replace(
  /const iconMap: Record<string, any> = \{[\s\S]*?\};/,
  `const iconMap: Record<string, any> = {
                      "Corporate Gifting": Gift,
                      "Fragrance Gifting": Droplets,
                      "Office Stationery": Paperclip,
                      "Computer Peripherals": Laptop,
                      "Employee Onboarding / Joining Kits": Briefcase,
                      "Festive & Seasonal Gifting": Sparkles,
                      "Client & Executive Appreciation": Gift,
                      "Conferences & Corporate Events": Briefcase,
                      "General Corporate Gifting": Gift,
                    };`
);
fs.writeFileSync(widgetPath, widget);

console.log("Updated both chat-flow.ts and ChatWidget.tsx");
