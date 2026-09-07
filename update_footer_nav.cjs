const fs = require("fs");

// Update Footer.tsx
const footerPath = "src/components/officeneed/Footer.tsx";
let footerText = fs.readFileSync(footerPath, "utf8");

footerText = footerText.replace(
  /const shopLinks = \[\s*"Corporate Gifting",\s*"Office Stationery",\s*"Computer Peripherals",\s*"Fragrance Gifting",\s*\];/,
  `const shopLinks = [
  "Officeneed Exclusive",
  "Corporate Gifting",
  "Office Stationery",
  "Computer Peripherals",
  "Fragrance Gifting",
];`
);

fs.writeFileSync(footerPath, footerText);

// Update navigation.ts
const navPath = "src/lib/navigation.ts";
let navText = fs.readFileSync(navPath, "utf8");

navText = navText.replace(
  /"Corporate Gifting": \{ collection: TAXONOMY\["Corporate Gifting"\].handle! \},/,
  `"Officeneed Exclusive": { collection: TAXONOMY["Officeneed Exclusive"].handle! },\n  "Corporate Gifting": { collection: TAXONOMY["Corporate Gifting"].handle! },`
);

fs.writeFileSync(navPath, navText);
console.log("Updated Footer and Navigation");
