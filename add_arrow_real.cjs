const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  '} from "lucide-react";',
  ', ArrowRight } from "lucide-react";'
);

fs.writeFileSync(path, text);
console.log("Actually added ArrowRight import");
