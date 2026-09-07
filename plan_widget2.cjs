const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let content = fs.readFileSync(path, "utf8");

if (!content.includes("useShopifyCatalogue")) {
  content = content.replace(
    'import { submitEnquiry } from "@/lib/enquiries.functions";',
    'import { submitEnquiry } from "@/lib/enquiries.functions";\nimport { useShopifyCatalogue } from "@/lib/shopify-overlay";'
  );

  content = content.replace(
    'const [open, setOpen] = useState(false);',
    'const shopifyProducts = useShopifyCatalogue([]) || [];\n  const [open, setOpen] = useState(false);'
  );
}

fs.writeFileSync(path, content);
console.log("Updated ChatWidget to use Shopify catalogue");
