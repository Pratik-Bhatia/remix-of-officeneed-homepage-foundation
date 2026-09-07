const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  ') : step?.id === "purpose" && step.options ? (',
  ') : step?.options && step.id !== "quantity" ? ('
);

text = text.replace(
  '<p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Choose a category</p>',
  '<p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider text-center">{step.id === "purpose" ? "Choose a category" : "Select an option"}</p>'
);

fs.writeFileSync(path, text);
console.log("Fixed standard options block");
