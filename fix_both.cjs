const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

// FIX 1: Add Fragrance Gifting to iconMap
text = text.replace(
  `const iconMap: Record<string, any> = {\r\n                      "Corporate Gifting": Gift,\r\n                      "Employee Joining Kits": Briefcase,\r\n                      "Festive Gifts": Sparkles,\r\n                      "Office Supplies": Paperclip,\r\n                      "Hardware & IT": Laptop,\r\n                      "Printing & Branding": Printer,\r\n                    };`,
  `const iconMap: Record<string, any> = {\r\n                      "Corporate Gifting": Gift,\r\n                      "Fragrance Gifting": Sparkles,\r\n                      "Employee Joining Kits": Briefcase,\r\n                      "Festive Gifts": Sparkles,\r\n                      "Office Supplies": Paperclip,\r\n                      "Hardware & IT": Laptop,\r\n                      "Printing & Branding": Printer,\r\n                    };`
);

// FIX 2: Add Fragrance Gifting branch in answer()
text = text.replace(
  `      if (phase === "qualification") {\n      const nextIndex = stepIndex + 1;\n      if (step.id === "purpose" && clean === "Fragrance Gifting") {`,
  `ALREADY_FIXED`
);

if (!text.includes("ALREADY_FIXED")) {
  // Branch is missing — inject it
  text = text.replace(
    `      if (phase === "qualification") {\r\n        const nextIndex = stepIndex + 1;\r\n        if (nextIndex < chatSteps.length) {`,
    `      if (phase === "qualification") {\r\n        const nextIndex = stepIndex + 1;\r\n        if (step.id === "purpose" && clean === "Fragrance Gifting") {\r\n          setPhase("fragrance");\r\n          return;\r\n        }\r\n        if (nextIndex < chatSteps.length) {`
  );
  console.log("Injected Fragrance branch");
} else {
  // Revert placeholder
  text = text.replace("ALREADY_FIXED", `      if (phase === "qualification") {\n      const nextIndex = stepIndex + 1;\n      if (step.id === "purpose" && clean === "Fragrance Gifting") {`);
  console.log("Branch already existed");
}

fs.writeFileSync(path, text);
console.log("Done writing");
