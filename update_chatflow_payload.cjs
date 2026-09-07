const fs = require("fs");
const path = "src/lib/chat-flow.ts";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /id: "file",\n\s*question: "Would you like to attach any logo or reference files\?",/g,
  `id: "file",
    question: "Do you need custom logo printing?",`
);

text = text.replace(
  /answers\.file \? \`File Attached: \$\{answers\.file\}\` : "",/g,
  `answers.file ? \`Custom Branding: \$\{answers.file\}\` : "",`
);

fs.writeFileSync(path, text);
console.log("Updated chat-flow.ts file step and message building.");
