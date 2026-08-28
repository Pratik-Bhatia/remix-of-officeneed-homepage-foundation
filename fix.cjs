const fs = require("fs");
let content = fs.readFileSync("src/lib/shopify.ts", "utf8");

content = content.replace(/const PRODUCT_FIELDS =[\s\S]*?export const STOREFRONT_QUERY/, `const PRODUCT_FIELDS = \`
  id
  title
  description
  descriptionHtml
  handle
  productType
  vendor
  tags
  availableForSale
  featuredImage { id url altText }
  priceRange { minVariantPrice { amount currencyCode } }
  images(first: 30) { edges { node { id url altText } } }
  variants(first: 100) {
    edges {
      node {
        id
        title
        sku
        price { amount currencyCode }
        compareAtPrice { amount currencyCode }
        availableForSale
        currentlyNotInStock
        image { id url altText }
        selectedOptions { name value }
      }
    }
  }
  options { name values }
  collections(first: 50) { edges { node { handle } } }
\`;

export const STOREFRONT_QUERY`);

fs.writeFileSync("src/lib/shopify.ts", content);
