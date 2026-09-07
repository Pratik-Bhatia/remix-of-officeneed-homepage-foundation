const node = {
  title: "Rasasi Hawas For Him Eau de Parfum – 100 ml",
  tags: [
    "Middle Eastern Perfume",
    "perfume",
    "United Arab Emirates"
  ],
  productType: "",
  vendor: "",
  description: ""
};

const normalize = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const RULES = [
  { category: "Fragrance Gifting", sub: "Perfume Gift Sets", match: /perfume gift set|fragrance gift set|perfume set/ },
  { category: "Fragrance Gifting", sub: "Middle Eastern Perfume", match: /attar|oud|arab|middle east/ },
  { category: "Fragrance Gifting", sub: "European Perfume", match: /perfum|fragranc|eau de|deodor|cologne/ },
];

function classify(node) {
  if (node.tags && node.tags.length > 0) {
    for (const rule of RULES) {
      if (node.tags.some(tag => tag.toLowerCase() === rule.sub.toLowerCase())) {
        return { category: rule.category, sub: rule.sub, method: "tag" };
      }
    }
  }

  const haystack = normalize(
    [node.title, node.productType, node.vendor, node.description?.slice(0, 120), ...(node.tags || [])]
      .filter(Boolean)
      .join(" "),
  );
  for (const rule of RULES) {
    if (rule.match.test(haystack)) return { category: rule.category, sub: rule.sub, method: "regex" };
  }
  return {
    category: "Office Supplies", sub: "Office Supplies", method: "default" };
}

console.log(classify(node));
