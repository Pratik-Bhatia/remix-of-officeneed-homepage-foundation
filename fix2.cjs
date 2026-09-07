const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  /setMessages\(\(m\) => \[\.\.\.m, \{ id: uid\(\), role: "user", text: clean \|\| "Skip" \}\]\);/,
  `setMessages((m) => [...m, { id: uid(), role: "user", text: clean || "Skip" }]);

    if (step.id === "purpose" && clean === "Fragrance & Perfumes") {
      setPhase("fragrance");
      return;
    }`
);

fs.writeFileSync(path, text);
console.log("Fixed!");
