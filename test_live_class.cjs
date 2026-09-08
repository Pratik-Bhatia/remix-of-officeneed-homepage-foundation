const token = "REMOVED_TOKEN";
const domain = "har1k4-di.myshopify.com";

const query = `
{
  products(first: 60, query: "title:*Benelux Sheet Protector A/4 , F/c @ A/3  150 Micron*") {
    edges {
      node {
        title
        productType
        vendor
        description
        tags
      }
    }
  }
}
`;

const RULES = [
  { category: "Office Stationery", sub: "Files and Folders", match: /sheet protector/ },
  { category: "Corporate Gifting", sub: "Corporate Gifts", match: /corporate gift|gift set|hamper|gifting/ },
];

const normalize = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function classify(node) {
  if (node.tags && node.tags.length > 0) {
    for (const rule of RULES) {
      if (node.tags.some(tag => tag.toLowerCase() === rule.sub.toLowerCase())) {
        return { type: "tag", category: rule.category, sub: rule.sub };
      }
    }
  }

  const haystack = normalize(
    [node.title, node.productType, node.vendor, node.description?.slice(0, 120), ...(node.tags || [])]
      .filter(Boolean)
      .join(" "),
  );
  for (const rule of RULES) {
    if (rule.match.test(haystack)) return { type: "regex", category: rule.category, sub: rule.sub };
  }
}

fetch(`https://${domain}/api/2025-07/graphql.json`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Storefront-Access-Token": token,
  },
  body: JSON.stringify({ query })
})
.then(res => res.json())
.then(json => {
  const node = json.data.products.edges[0].node;
  console.log("Classify Result:", classify(node));
})
.catch(err => console.error(err));
