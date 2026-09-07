const fs = require("fs");
const path = "src/components/officeneed/CartDrawer.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /aria-label="Close bag"/g,
  'aria-label="Close shopping bag"'
);

text = text.replace(
  /aria-label=\{`Remove \$\{item\.product\.node\.title\}`\}/g,
  'aria-label="Remove item from bag"'
);

const oldVariantStr = `{item.selectedOptions.length > 0 ? (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {item.selectedOptions.map((o) => o.value).join(" | ")}
                                </p>
                              ) : null}`;

const newVariantStr = `{item.selectedOptions.filter(o => o.value && o.value.toLowerCase() !== 'default title' && o.value.toLowerCase() !== 'default').length > 0 ? (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {item.selectedOptions.filter(o => o.value && o.value.toLowerCase() !== 'default title' && o.value.toLowerCase() !== 'default').map((o) => o.value).join(" | ")}
                                </p>
                              ) : null}`;

text = text.replace(oldVariantStr, newVariantStr);

fs.writeFileSync(path, text);
console.log("Updated CartDrawer.tsx");
