const fs = require("fs");
let content = fs.readFileSync("src/routes/products.index.tsx", "utf8");

content = content.replace(
  'if (!sub.handle) return null;\n                    return (',
  `return (`
);

content = content.replace(
  'onClick={() => setCollection(sub.handle)}',
  `onClick={() => {
                            if (sub.handle) {
                              setCollection(sub.handle);
                            } else {
                              navigate({
                                search: (prev: any) => ({ ...prev, collection: undefined, missingMapping: sub.title }),
                                replace: true,
                              });
                            }
                          }}`
);

fs.writeFileSync("src/routes/products.index.tsx", content);
console.log("Updated subcategory mapping to show items without handles.");
