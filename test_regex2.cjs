const haystack = "worldone expanding file folder with handle and lock 13 indexed pocket for document stationery officeneed worldone expanding file is a durable and practical document storage solution designed for organizing and carrying importan file and folder stationery";

const rules = [
  { category: "Corporate Gifting", sub: "Corporate Gifts", match: /corporate gift|gift set|hamper|gifting/ },
];

for (const rule of rules) {
  const m = rule.match.exec(haystack);
  if (m) {
    console.log("Matched:", rule.sub, "with string:", m[0], "at index:", m.index);
  } else {
    console.log("No match");
  }
}
