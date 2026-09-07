const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  'const Icon = iconMap[opt] || ChevronRight;',
  'const Icon = iconMap[opt];'
);

text = text.replace(
  '<Icon className="size-4 opacity-50 group-hover:opacity-80 group-active:opacity-100 transition-opacity" strokeWidth={1.5} />',
  '{Icon && <Icon className="size-4 opacity-50 group-hover:opacity-80 group-active:opacity-100 transition-opacity" strokeWidth={1.5} />}'
);

fs.writeFileSync(path, text);
console.log("Fixed chevron icons");
