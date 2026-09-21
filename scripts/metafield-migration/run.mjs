#!/usr/bin/env node
/**
 * Shopify product metafield migration -- dry-run capable, product-specific
 * (never forces the same field set onto every product).
 *
 * Usage:
 *   node --env-file=.env scripts/metafield-migration/run.mjs            (dry run, default)
 *   DRY_RUN=false node --env-file=.env scripts/metafield-migration/run.mjs   (writes -- requires SHOPIFY_SHOP/SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET, see shopify-auth.mjs)
 *
 * Run via `npm run metafield-migration:dry-run` (added to package.json),
 * which invokes this through tsx so it can import the REAL taxonomy.ts and
 * product-details-schema.ts from src/lib -- not a duplicated copy.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { getCategoryByHandle, getCategoryHandles } from "../../src/lib/taxonomy.ts";
import { PRODUCT_DETAIL_SCHEMA_BY_CATEGORY, REQUIRED_METAFIELD_IDENTIFIERS } from "../../src/lib/product-details-schema.ts";
import { extractAttributes, bindingValuesEquivalent } from "./attribute-extractor.mjs";
import { fetchProductForMigration, fetchAllHandlesInCollection, writeMetafields, hasAdminCredentials } from "./shopify-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";

// Phase 1 smoke-test batch (~5 products): the 3 products named in the
// original PDP audit, one more Officeneed Exclusive product for variety,
// and one Fragrance Gifting product specifically to prove the system
// correctly reports "no schema yet" instead of forcing stationery fields
// onto it. Used when MIGRATION_CATEGORY is not set.
const SMOKE_TEST_HANDLES = [
  "officeneed-unruled-notebook-a5-40-pages",
  "officeneed-unruled-wiro-book-flexible-geometric",
  "practical-sheets-for-college-one-side-ruled-50-sheets",
  "officeneed-kraft-cover-wiro-notebook-ruled",
  "emporio-armani-stronger-with-you-parfum",
];

// Set MIGRATION_CATEGORY="Officeneed Exclusive" (a MainCategory title from
// taxonomy.ts) to instead process every real product in that category's
// full collection tree (main + subcategory collections), paginated --
// this is the path that scales to all 200+ products later.
const MIGRATION_CATEGORY = process.env.MIGRATION_CATEGORY;

async function resolveBatchHandles() {
  if (!MIGRATION_CATEGORY) return SMOKE_TEST_HANDLES;
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

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function processProduct(handle) {
  const node = await fetchProductForMigration(handle, REQUIRED_METAFIELD_IDENTIFIERS);
  if (!node) {
    return { handle, error: "Product not found in Shopify (handle may be wrong or unpublished)." };
  }

  const collectionHandles = (node.collections?.edges ?? []).map((e) => e.node.handle);
  const category = resolveMainCategory(collectionHandles);
  const schema = category ? PRODUCT_DETAIL_SCHEMA_BY_CATEGORY[category] : undefined;

  const existingByKey = new Map();
  for (const mf of node.metafields ?? []) {
    if (mf) existingByKey.set(`${mf.namespace}.${mf.key}`, mf.value);
  }

  const extracted = extractAttributes(node.descriptionHtml || "");

  const rows = [];

  if (!schema) {
    // No Product Details schema exists for this category yet (Phase 1 only
    // defined Officeneed Exclusive) -- every extracted attribute is reported
    // as NOT APPLICABLE rather than being forced into an unrelated field.
    for (const [key, info] of extracted.entries()) {
      rows.push({
        product: node.title,
        handle,
        productId: node.id,
        category: category ?? "(unresolved)",
        metafield: key,
        extractedValue: info.value,
        existingValue: "",
        action: "NOT APPLICABLE",
        reason: category
          ? `No Product Details schema defined yet for "${category}" (Phase 1 only covers Officeneed Exclusive).`
          : "Category could not be resolved from this product's Shopify collections.",
        confidence: info.confidence,
      });
    }
    if (rows.length === 0) {
      rows.push({
        product: node.title,
        handle,
        productId: node.id,
        category: category ?? "(unresolved)",
        metafield: "",
        extractedValue: "",
        existingValue: "",
        action: "NOT APPLICABLE",
        reason: category
          ? `No Product Details schema defined yet for "${category}".`
          : "Category could not be resolved.",
        confidence: "",
      });
    }
    return { handle, category, rows };
  }

  for (const field of schema) {
    const metafieldKey = `${field.metafield.namespace}.${field.metafield.key}`;
    const existingValue = existingByKey.get(metafieldKey);
    // The canonical attribute key used by the extractor matches the
    // metafield's own key name (brand, product_type, dimensions, pages,
    // paper_weight, ruling, binding) -- see product-details-schema.ts.
    const attributeKey = field.metafield.key === "dimensions" ? "dimensions" : field.metafield.key;
    const info = extracted.get(attributeKey);

    let action;
    let reason;
    const confidence = info?.confidence ?? "";

    // Approved normalization: Binding/Cover is compared by its comma-
    // separated components regardless of order (same real facts, description
    // just listed "Binding:"/"Cover:" lines in a different sequence) -- every
    // other field still requires an exact string match.
    const valuesMatch =
      existingValue && info
        ? attributeKey === "binding"
          ? bindingValuesEquivalent(existingValue, info.value)
          : existingValue.trim() === info.value.trim()
        : false;

    if (existingValue && info && valuesMatch) {
      action = "EXISTING — SKIPPED";
      reason = "Shopify already has this value (same components); not overwriting.";
    } else if (existingValue && info && !valuesMatch) {
      action = "CONFLICT — MANUAL REVIEW";
      reason = `Shopify has "${existingValue}" but the description says "${info.value}". Needs a human decision.`;
    } else if (existingValue && !info) {
      action = "EXISTING — SKIPPED";
      reason = "Shopify already has a value and the description doesn't contradict it; not touched.";
    } else if (!existingValue && info) {
      action = "POPULATE";
      reason = `Found in description via label "${info.rawLabel}".`;
    } else {
      action = "NOT FOUND";
      reason = "This field is relevant to the category's schema, but the description doesn't state it.";
    }

    rows.push({
      product: node.title,
      handle,
      productId: node.id,
      category,
      metafield: metafieldKey,
      extractedValue: info?.value ?? "",
      existingValue: existingValue ?? "",
      action,
      reason,
      confidence,
    });
  }

  return { handle, category, rows };
}

/**
 * Prints exactly what a write run would do, BEFORE any write is attempted --
 * required reading whether DRY_RUN is true or false. Only ever computed
 * from `allRows`, the same data the CSV is built from, so this summary and
 * the CSV can never disagree.
 */
function printPreWriteSummary(allRows) {
  const productIds = new Set(allRows.filter((r) => r.productId).map((r) => r.productId));
  const populate = allRows.filter((r) => r.action === "POPULATE");
  const existingSkipped = allRows.filter((r) => r.action === "EXISTING — SKIPPED");
  const conflicts = allRows.filter((r) => r.action === "CONFLICT — MANUAL REVIEW");
  const notFound = allRows.filter((r) => r.action === "NOT FOUND");

  console.log("\n" + "=".repeat(100));
  console.log("PRE-WRITE SUMMARY");
  console.log("=".repeat(100));
  console.log(`Products processed: ${productIds.size}`);
  console.log(`\nMetafields that WOULD BE CREATED/POPULATED (action=POPULATE, the only action ever written): ${populate.length}`);
  populate.forEach((r) => console.log(`  - ${r.product} (${r.handle}) -> ${r.metafield} = "${r.extractedValue}"`));
  console.log(`\nExisting fields that will be SKIPPED, never overwritten: ${existingSkipped.length}`);
  console.log(`\nConflicts that will be SKIPPED, require manual review, never auto-written: ${conflicts.length}`);
  conflicts.forEach((r) => console.log(`  - ${r.product} (${r.handle}) -> ${r.metafield}`));
  console.log(`\nFields with no extracted value (left blank, never fabricated): ${notFound.length}`);
  console.log("");

  return { populate, existingSkipped, conflicts, notFound };
}

/**
 * Writes ONLY rows whose action is POPULATE -- the sole action this
 * function will ever act on. Groups by product so each product gets one
 * metafieldsSet call. Writes the extracted value exactly as captured, with
 * no transformation. Continues to the next product if one write fails.
 */
async function performWrites(populateRows) {
  const byProduct = new Map();
  for (const row of populateRows) {
    if (row.action !== "POPULATE") continue; // defence in depth -- should be impossible given the caller's filter
    if (!byProduct.has(row.productId)) {
      byProduct.set(row.productId, { product: row.product, handle: row.handle, fields: [] });
    }
    const [namespace, key] = row.metafield.split(".");
    byProduct.get(row.productId).fields.push({ namespace, key, value: row.extractedValue });
  }

  let written = 0;
  let failed = 0;
  for (const [productId, { product, handle, fields }] of byProduct) {
    try {
      await writeMetafields(productId, fields);
      written += fields.length;
      console.log(`  WROTE ${fields.length} field(s) for ${product} (${handle})`);
    } catch (err) {
      failed += fields.length;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  FAILED for ${product} (${handle}): ${message}`);
    }
  }
  console.log(`\nWrite pipeline complete: ${written} metafield(s) written, ${failed} failed.`);
}

async function main() {
  const batchHandles = await resolveBatchHandles();
  console.log(`Metafield migration -- DRY_RUN=${DRY_RUN}`);
  console.log(
    MIGRATION_CATEGORY
      ? `Category: ${MIGRATION_CATEGORY} -- ${batchHandles.length} product(s) found\n`
      : `Smoke-test batch: ${batchHandles.length} products\n`,
  );

  const allRows = [];
  const errors = [];

  for (const handle of batchHandles) {
    try {
      const result = await processProduct(handle);
      if (result.error) {
        errors.push({ handle, message: result.error });
        allRows.push({
          product: "",
          handle,
          productId: "",
          category: "",
          metafield: "",
          extractedValue: "",
          existingValue: "",
          action: "ERROR",
          reason: result.error,
          confidence: "",
        });
        continue;
      }
      console.log("=".repeat(100));
      console.log(`${result.rows[0]?.product ?? handle}  (${handle})`);
      console.log(`  Category: ${result.category ?? "(unresolved)"}`);
      console.log(`  ${"ATTRIBUTE".padEnd(24)}${"EXTRACTED VALUE".padEnd(40)}ACTION`);
      for (const r of result.rows) {
        const label = r.metafield || "(none found)";
        console.log(`  ${label.padEnd(24)}${(r.extractedValue || "—").padEnd(40)}${r.action}`);
      }
      allRows.push(...result.rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ handle, message });
      allRows.push({
        product: "",
        handle,
        productId: "",
        category: "",
        metafield: "",
        extractedValue: "",
        existingValue: "",
        action: "ERROR",
        reason: message,
        confidence: "",
      });
      console.log(`\nERROR processing ${handle}: ${message}`);
    }
  }

  // CSV report
  const header = ["Product", "Handle", "Product ID", "Category", "Metafield", "Extracted Value", "Existing Value", "Action", "Reason", "Confidence"];
  const csvLines = [header.join(",")];
  for (const r of allRows) {
    csvLines.push(
      [r.product, r.handle, r.productId, r.category, r.metafield, r.extractedValue, r.existingValue, r.action, r.reason, r.confidence]
        .map(csvEscape)
        .join(","),
    );
  }
  const outPath = join(__dirname, "product-metafield-migration-report.csv");
  writeFileSync(outPath, csvLines.join("\n"), "utf8");
  console.log(`\nCSV report written to: ${outPath}`);

  const summary = allRows.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\nAction summary:", summary);

  if (errors.length) {
    console.log(`\n${errors.length} product(s) failed:`);
    errors.forEach((e) => console.log(`  - ${e.handle}: ${e.message}`));
  }

  const { populate } = printPreWriteSummary(allRows);

  // Production safety check: writes require an EXPLICIT DRY_RUN=false --
  // the default (unset, or anything other than the literal string "false")
  // always stays read-only.
  if (!DRY_RUN) {
    console.log("DRY_RUN=false was explicitly set.");
    if (!hasAdminCredentials()) {
      console.log("BLOCKED: Shopify Admin credentials (SHOPIFY_SHOP/SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET) are not configured. No Shopify writes were attempted.");
    } else if (populate.length === 0) {
      console.log("Nothing to write -- no rows have action=POPULATE.");
    } else {
      console.log(`Proceeding to write ${populate.length} metafield(s)...`);
      await performWrites(populate);
    }
  } else {
    console.log("DRY_RUN=true (default) -- read-only. No Shopify writes were performed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
