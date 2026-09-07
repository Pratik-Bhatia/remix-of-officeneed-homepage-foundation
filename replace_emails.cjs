const fs = require("fs");

const files = [
  "src/config/contact.ts",
  "src/lib/email-service.ts",
  "src/routes/cancellation-policy.tsx",
  "src/routes/contact-us.tsx",
  "src/routes/privacy-policy.tsx",
  "src/routes/returns-refunds.tsx",
  "src/routes/terms-and-conditions.tsx"
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  // Replace info@, support@, hello@, etc. with contact@officeneed.in
  content = content.replace(/[a-zA-Z0-9._%+-]+@officeneed\.(com|in|co\.in)/g, "contact@officeneed.in");
  fs.writeFileSync(file, content);
}
console.log("Updated emails");
