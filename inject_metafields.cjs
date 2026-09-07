const fs = require("fs");
const path = "src/lib/shopify.ts";
let text = fs.readFileSync(path, "utf8");

const metafieldsQuery = `
    metafields(identifiers: [
      {namespace: "fragrance", key: "recipient_type"},
      {namespace: "fragrance", key: "gender"},
      {namespace: "fragrance", key: "age_group"},
      {namespace: "fragrance", key: "personality"},
      {namespace: "fragrance", key: "mood"},
      {namespace: "fragrance", key: "notes"},
      {namespace: "fragrance", key: "intensity"},
      {namespace: "fragrance", key: "occasion"},
      {namespace: "fragrance", key: "weather"},
      {namespace: "fragrance", key: "time_of_day"},
      {namespace: "custom", key: "ai_subtitle"}
    ]) { key value type }
`;

if (!text.includes("metafields(identifiers")) {
  text = text.replace("options { name values }", "options { name values }" + metafieldsQuery);
  fs.writeFileSync(path, text);
  console.log("Injected metafields query!");
} else {
  // If it does include it, replace it to ensure ai_subtitle is there
  text = text.replace(/metafields\(identifiers: \[[\s\S]*?\]\) \{ key value type \}/, metafieldsQuery.trim());
  fs.writeFileSync(path, text);
  console.log("Updated metafields query!");
}
