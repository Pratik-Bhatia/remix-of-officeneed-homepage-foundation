const fs = require("fs");
const path = "src/components/officeneed/FragranceQuiz.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /className="w-24 h-24 object-cover rounded-lg bg-secondary\/50 mix-blend-multiply"/g,
  'className="w-full h-full object-contain rounded-lg bg-secondary/50 mix-blend-multiply"'
);

// wait, if I make it w-full h-full on the img, I need to make sure its parent has a fixed size!
// The parent is: <div className="flex gap-4 mb-4"> ... it is NOT wrapped in a fixed size container!
// It was directly: <img src="..." className="w-24 h-24 ...">
// If I change the img to w-full h-full, it will expand to the flex container's max width and look huge!
// The user said: "Ensure the <img> has the CSS properties: object-fit: contain; width: 100%; height: 100%;. If using Tailwind, apply object-contain w-full h-full. Ensure its parent container has a defined height/width or aspect ratio."

text = text.replace(
  /<img src=\{m\.product\.images\?\.\[0\] \|\| ""\} alt="" className="w-full h-full object-contain rounded-lg bg-secondary\/50 mix-blend-multiply" \/>/g,
  '<div className="w-24 h-24 shrink-0"><img src={m.product.images?.[0] || ""} alt="" className="w-full h-full object-contain rounded-lg bg-secondary/50 mix-blend-multiply" /></div>'
);

text = text.replace(
  /<img src=\{m\.product\.images\?\.\[0\] \|\| ""\} alt="" className="w-24 h-24 object-cover rounded-lg bg-secondary\/50 mix-blend-multiply" \/>/g,
  '<div className="w-24 h-24 shrink-0"><img src={m.product.images?.[0] || ""} alt="" className="w-full h-full object-contain rounded-lg bg-secondary/50 mix-blend-multiply" /></div>'
);


fs.writeFileSync(path, text);
console.log("Updated image CSS logic");
