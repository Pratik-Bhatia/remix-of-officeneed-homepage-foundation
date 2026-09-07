const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /\} \: step\?\.options \? \(\n\s*<div className="flex flex-wrap gap-2 justify-end">\n\s*\{step\.options\.map\(\(opt\) => \(/,
  `} : step?.options ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2 justify-end">
                  {step.options.map((opt) => (`
);

text = text.replace(
  /<\/button>\n\s*\)\)\}\n\s*<\/div>\n\s*\) \: step\?\.inputType === "file" \? \(/,
  `</button>
                  ))}
                </div>
                {step.disclaimer && (
                  <p className="text-[12px] text-muted-foreground/80 leading-snug px-2 text-right">
                    {step.disclaimer}
                  </p>
                )}
              </div>
            ) : step?.inputType === "file" ? (`
);

// We need to fix recommendProducts call!
text = text.replace(
  /const picks = recommendProducts\((next|next, clean)\);/g,
  (match, p1) => `const picks = recommendProducts(shopifyProducts, ${p1});`
);

fs.writeFileSync(path, text);
console.log("Updated ChatWidget.tsx");
