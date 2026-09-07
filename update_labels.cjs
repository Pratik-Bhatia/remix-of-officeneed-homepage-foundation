const fs = require("fs");
const navPath = "src/components/officeneed/Navbar.tsx";
const cartPath = "src/components/officeneed/CartDrawer.tsx";

// --- Navbar.tsx ---
let navText = fs.readFileSync(navPath, "utf8");

navText = navText.replace(
  /label="Open menu"/g,
  'label="Open navigation menu"'
);

navText = navText.replace(
  /label="Search"/g,
  'label="Search store"'
);

fs.writeFileSync(navPath, navText);
console.log("Updated Navbar.tsx");

// --- CartDrawer.tsx ---
let cartText = fs.readFileSync(cartPath, "utf8");

cartText = cartText.replace(
  /aria-label=\{`Cart, \$\{totalItems\} item\$\{totalItems === 1 \? "" : "s"\}`\}/g,
  'aria-label="Open shopping bag"'
);

fs.writeFileSync(cartPath, cartText);
console.log("Updated CartDrawer.tsx");

