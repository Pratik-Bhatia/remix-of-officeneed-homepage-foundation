const fs = require("fs");
const path = "src/lib/navigation.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  '"Computer Peripherals": { collection: TAXONOMY["Computer Peripherals"].handle! },',
  '"Computer Peripherals": { collection: TAXONOMY["Computer Peripherals"].handle! },'
);

// wait, navigation.ts reads TAXONOMY dynamically!
console.log("No change needed in navigation.ts for Computer Peripherals handle, as it uses TAXONOMY.");
