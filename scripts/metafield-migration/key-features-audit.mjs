#!/usr/bin/env node
/**
 * READ-ONLY audit: compares each product's current "Key Features" bullets
 * against the structured Product Details fields (the same extraction used
 * by the metafield migration, attribute-extractor.mjs) to find bullets that
 * just restate a specification already captured structurally.
 *
 * Performs NO writes of any kind -- no Shopify mutation, no description
 * edit, no metafield write. Output is a CSV + console report for human
 * review only. Nothing here is applied automatically.
 *
 * Usage: node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/metafield-migration/key-features-audit.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { getCategoryByHandle, getCategoryHandles } from "../../src/lib/taxonomy.ts";
import { extractAttributes, describesSameBindingFact, extractBindingMentions } from "./attribute-extractor.mjs";
import { fetchProductForMigration, fetchAllHandlesInCollection } from "./shopify-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_CATEGORY = process.env.MIGRATION_CATEGORY || "Officeneed Exclusive";

async function resolveBatchHandles() {
  const collectionHandles = getCategoryHandles(MIGRATION_CATEGORY);
  const seen = new Set();
  for (const collectionHandle of collectionHandles) {
    const handles = await fetchAllHandlesInCollection(collectionHandle);
    handles.forEach((h) => seen.add(h));
  }
  return [...seen];
}

function resolveMainCategory(collectionHandles) {
  for (const handle of collectionHandles) {
    const match = getCategoryByHandle(handle);
    if (match) return match.parentTitle ?? match.node.title;
  }
  return undefined;
}

// Human-readable label per canonical Product Details attribute key.
const FIELD_LABELS = {
  brand: "Brand",
  product_type: "Product Type",
  dimensions: "Size / Dimensions",
  pages: "Pages",
  paper_weight: "Paper Weight",
  ruling: "Ruling",
  binding: "Binding / Cover",
};

/**
 * Finds the "Key Features"/"Product Features"/"Features" section of a
 * description and splits it into individual bullet lines. Independent of
 * (and not a modification of) the production extractStructuredData() in
 * shopify-overlay.ts -- this is audit-only tooling.
 */
function extractKeyFeatureBullets(html) {
  if (!html) return [];

  // Convert to a flat, tag-free set of lines, but keep <li> boundaries and
  // <br> boundaries as separate lines, same approach as attribute-extractor.
  const withMarkers = html
    .replace(/<li[^>]*>/gi, "\n\x00LI\x00")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div|ul)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  const lines = withMarkers.split("\n").map((l) => l.replace(/^\x00LI\x00/, "").trim()).filter(Boolean);

  const HEADER_RE = /^(product features|key features|features)\s*:?$/i;
  const NEXT_SECTION_RE = /^(specifications?|product details|fragrance notes|material|dimensions|compatibility|what'?s included(?: in the box)?|customization|care information|technical specifications)\s*:?$/i;

  let inSection = false;
  const bullets = [];
  for (const line of lines) {
    if (HEADER_RE.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (NEXT_SECTION_RE.test(line)) break; // reached the next section, stop
    bullets.push(line);
  }
  return bullets;
}

/** Normalizes a value/text fragment for loose substring comparison (case/spacing/GSM-format insensitive). */
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/gsm/g, " gsm")
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "")
    .trim();
}

/**
 * Checks whether a Key Feature bullet restates a given Product Details
 * value, and if so, returns the leftover text after removing the
 * label-ish/value-ish portion (a mechanical suggestion only -- always
 * presented for human review, never applied automatically).
 */
function matchAgainstField(bullet, fieldKey, fieldValue) {
  if (!fieldValue) return null;
  const bulletNorm = normalize(bullet);
  const valueNorm = normalize(fieldValue);

  // Direct containment of the structured value's text in the bullet.
  if (bulletNorm.includes(valueNorm)) {
    return { matched: true, fieldKey };
  }

  // Binding/Cover is a concatenation of separate real facts (e.g. "Kraft/
  // Brown, Uncoated" is one Cover: line and one implicit descriptor) -- the
  // description's Key Features often state only ONE component per bullet
  // ("Cover: ..." / "Binding: ..." as separate lines), so the FULL combined
  // value never appears verbatim in a single bullet. Match component-by-
  // component instead of requiring the whole concatenation to appear.
  if (fieldKey === "binding") {
    const components = fieldValue.split(",").map((c) => normalize(c.trim())).filter(Boolean);
    if (components.some((c) => c.length > 3 && bulletNorm.includes(c))) {
      return { matched: true, fieldKey };
    }
    // Same word-overlap check attribute-extractor.mjs uses to avoid adding a
    // near-duplicate binding component (e.g. "Spiral/Wire Bound" already
    // covers "Wiro (Spiral) Binding") -- kept consistent so the audit never
    // flags as "unique" something the extractor itself already treats as
    // the same fact. Only checked against the bullet's own leading binding
    // phrase (not its full benefit text), same scoping the extractor uses.
    const [leadingBindingPhrase] = extractBindingMentions(bullet);
    if (leadingBindingPhrase && describesSameBindingFact(fieldValue, leadingBindingPhrase)) {
      return { matched: true, fieldKey };
    }
  }

  // Numeric fields (pages): match the bare number as a whole word, since the
  // bullet often reads "250 Ruled Pages" (extra word "Ruled" inserted) while
  // Product Details just has "250".
  if (fieldKey === "pages" && /^\d+$/.test(fieldValue)) {
    const re = new RegExp(`\\b${fieldValue}\\b`);
    if (re.test(bullet)) return { matched: true, fieldKey };
  }

  return null;
}

function suggestBenefitOnlyText(bullet) {
  // Most bullets in this catalogue follow "Label – benefit" (em dash or
  // hyphen). If a dash separator exists, the right-hand side is usually the
  // benefit; otherwise (pure "<li><strong>Label:</strong> Value</li>" style)
  // there is no benefit text to keep.
  const dashSplit = bullet.split(/\s[–-]\s/);
  if (dashSplit.length >= 2) {
    return dashSplit.slice(1).join(" - ").trim();
  }
  // "Label: value, extra descriptive clause" -- try splitting after the colon's value.
  return null;
}

function auditProduct(node, category, extracted) {
  const bullets = extractKeyFeatureBullets(node.descriptionHtml || "");
  const rows = [];

  for (const bullet of bullets) {
    let matchedField = null;
    for (const [fieldKey, info] of extracted.entries()) {
      if (!(fieldKey in FIELD_LABELS)) continue; // only compare against real Product Details fields
      const m = matchAgainstField(bullet, fieldKey, info.value);
      if (m) {
        matchedField = { fieldKey, fieldValue: info.value };
        break;
      }
    }

    if (!matchedField) {
      rows.push({
        product: node.title,
        handle: node.handle,
        category,
        keyFeature: bullet,
        matchingProductDetail: "",
        duplicate: "NO",
        recommendedAction: "KEEP AS-IS (genuine benefit / use-case info, not represented in Product Details)",
      });
      continue;
    }

    const benefitOnly = suggestBenefitOnlyText(bullet);
    const hasSubstantiveBenefit = benefitOnly && benefitOnly.replace(/[^a-z0-9]/gi, "").length >= 8;

    if (hasSubstantiveBenefit) {
      rows.push({
        product: node.title,
        handle: node.handle,
        category,
        keyFeature: bullet,
        matchingProductDetail: `${FIELD_LABELS[matchedField.fieldKey]} = ${matchedField.fieldValue}`,
        duplicate: "PARTIAL",
        recommendedAction: `REMOVE DUPLICATE SPECIFICATION / RETAIN BENEFIT CONTEXT -- suggested: "${benefitOnly}"`,
      });
    } else {
      rows.push({
        product: node.title,
        handle: node.handle,
        category,
        keyFeature: bullet,
        matchingProductDetail: `${FIELD_LABELS[matchedField.fieldKey]} = ${matchedField.fieldValue}`,
        duplicate: "YES",
        recommendedAction: "REMOVE DUPLICATE SPECIFICATION (no additional benefit content found)",
      });
    }
  }

  return rows;
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const handles = await resolveBatchHandles();
  console.log(`READ-ONLY Key Features vs Product Details audit -- category: ${MIGRATION_CATEGORY}`);
  console.log(`${handles.length} product(s)\n`);
  console.log("No Shopify writes, no description edits, no metafield writes will be performed by this script.\n");

  const allRows = [];

  for (const handle of handles) {
    const node = await fetchProductForMigration(handle, []);
    if (!node) {
      console.log(`SKIP ${handle}: product not found`);
      continue;
    }
    const collectionHandles = (node.collections?.edges ?? []).map((e) => e.node.handle);
    const category = resolveMainCategory(collectionHandles);
    const extracted = extractAttributes(node.descriptionHtml || "");

    const rows = auditProduct(node, category, extracted);
    console.log("=".repeat(100));
    console.log(`${node.title}  (${handle})`);
    if (rows.length === 0) {
      console.log("  (no Key Features section found in this product's description)");
    }
    for (const r of rows) {
      console.log(`  KEY FEATURE: "${r.keyFeature}"`);
      console.log(`    Matching Product Detail: ${r.matchingProductDetail || "(none)"}`);
      console.log(`    Duplicate?: ${r.duplicate}`);
      console.log(`    Recommendation: ${r.recommendedAction}`);
    }
    allRows.push(...rows);
  }

  const header = ["Product", "Handle", "Category", "Key Feature", "Matching Product Detail", "Duplicate?", "Recommended Action"];
  const csvLines = [header.join(",")];
  for (const r of allRows) {
    csvLines.push(
      [r.product, r.handle, r.category, r.keyFeature, r.matchingProductDetail, r.duplicate, r.recommendedAction]
        .map(csvEscape)
        .join(","),
    );
  }
  const outPath = join(__dirname, "key-features-audit-report.csv");
  writeFileSync(outPath, csvLines.join("\n"), "utf8");
  console.log(`\nCSV report written to: ${outPath}`);

  const summary = allRows.reduce((acc, r) => {
    acc[r.duplicate] = (acc[r.duplicate] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\nSummary:", summary, `(total bullets audited: ${allRows.length})`);
  console.log("\nThis is a READ-ONLY report. No Shopify description, Key Feature, or metafield was modified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
