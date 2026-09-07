const fs = require("fs");
let content = fs.readFileSync("src/components/officeneed/Navbar.tsx", "utf8");

content = content.replace(
  'import { primaryNavCategories as navCategories, navItemTarget } from "@/lib/navigation";',
  'import { primaryNavCategories as navCategories, navItemTarget, navCategoryTarget } from "@/lib/navigation";'
);

content = content.replace(
  /<button\s+type="button"\s+aria-expanded=\{openId === cat.id\}\s+aria-controls=\{`menu-\$\{cat\.id\}`\}\s+data-open=\{openId === cat\.id\}\s+onClick=\{[^}]+\}\s+onFocus=\{[^}]+\}\s+className=\{cn\(\s+"nav-link h-16 xl:h-20",\s+cat\.featured && "font-semibold text-foreground",?\s+\)\}\s*>\s*<span className="whitespace-nowrap">\{cat\.label\}<\/span>\s*<\/button>/g,
  `<Link
                  to="/products"
                  search={navCategoryTarget(cat.id)}
                  aria-expanded={openId === cat.id}
                  aria-controls={\`menu-\${cat.id}\`}
                  data-open={openId === cat.id}
                  onFocus={() => setOpenId(cat.id)}
                  onClick={() => setOpenId(null)}
                  className={cn(
                    "nav-link h-16 xl:h-20",
                    cat.featured && "font-semibold text-foreground",
                  )}
                >
                  <span className="whitespace-nowrap">{cat.label}</span>
                </Link>`
);

fs.writeFileSync("src/components/officeneed/Navbar.tsx", content);
console.log("Navbar button converted to Link.");
