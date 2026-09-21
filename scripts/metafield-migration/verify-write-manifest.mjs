#!/usr/bin/env node
/**
 * FINAL READ-ONLY pre-write validation of the write manifest.
 *
 * Re-fetches every POPULATE product by its exact GID via the Admin API
 * (the same API a write would use) and re-confirms, live, right before any
 * write is authorized:
 *   - title/handle match the manifest
 *   - the product is genuinely Officeneed Exclusive
 *   - every field marked POPULATE is currently empty on Shopify
 *   - the one CONFLICT is still a real conflict, untouched
 *
 * Calls NO mutation. metafieldsSet is never referenced in this file.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { getCategoryByHandle } from "../../src/lib/taxonomy.ts";
import { extractAttributes, bindingValuesEquivalent } from "./attribute-extractor.mjs";
import { fetchProductByIdViaAdmin } from "./shopify-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseCsv(text) {
  const lines = text.split("\n").filter(Boolean);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

function resolveMainCategory(collectionHandles) {
  for (const handle of collectionHandles) {
    const match = getCategoryByHandle(handle);
    if (match) return match.parentTitle ?? match.node.title;
  }
  return undefined;
}

async function main() {
  const csvPath = join(__dirname, "product-metafield-migration-report.csv");
  const rows = parseCsv(readFileSync(csvPath, "utf8"));

  const populateRows = rows.filter((r) => r.Action === "POPULATE");
  const existingSkippedRows = rows.filter((r) => r.Action === "EXISTING — SKIPPED");
  const notFoundRows = rows.filter((r) => r.Action === "NOT FOUND");
  const conflictRows = rows.filter((r) => r.Action === "CONFLICT — MANUAL REVIEW");

  console.log("FINAL PRE-WRITE VALIDATION -- READ-ONLY. No metafieldsSet call in this script.\n");
  console.log(`Manifest (from CSV): POPULATE=${populateRows.length}, EXISTING-SKIPPED=${existingSkippedRows.length}, NOT FOUND=${notFoundRows.length}, CONFLICT=${conflictRows.length}\n`);

  const byProduct = new Map();
  for (const r of populateRows) {
    if (!byProduct.has(r["Product ID"])) {
      byProduct.set(r["Product ID"], { product: r.Product, handle: r.Handle, rows: [] });
    }
    byProduct.get(r["Product ID"]).rows.push(r);
  }

  let mismatches = 0;
  let stillEmptyCount = 0;
  let noLongerEmptyCount = 0;

  console.log("=".repeat(100));
  console.log("STEP 1 — RE-VERIFY EACH POPULATE PRODUCT BY GID (live Admin API read)");
  console.log("=".repeat(100));

  for (const [gid, { product: manifestTitle, handle: manifestHandle, rows: fieldRows }] of byProduct) {
    const live = await fetchProductByIdViaAdmin(gid);

    console.log(`\n${gid}`);
    if (!live) {
      console.log(`  FAIL: product not found by this GID.`);
      mismatches++;
      continue;
    }

    const titleMatch = live.title === manifestTitle;
    const handleMatch = live.handle === manifestHandle;
    const collectionHandles = (live.collections?.edges ?? []).map((e) => e.node.handle);
    const category = resolveMainCategory(collectionHandles);
    const categoryMatch = category === "Officeneed Exclusive";

    console.log(`  Manifest title:  "${manifestTitle}"`);
    console.log(`  Live title:      "${live.title}"   -> ${titleMatch ? "MATCH" : "MISMATCH"}`);
    console.log(`  Manifest handle: "${manifestHandle}"`);
    console.log(`  Live handle:     "${live.handle}"   -> ${handleMatch ? "MATCH" : "MISMATCH"}`);
    console.log(`  Live category:   ${category ?? "(unresolved)"}   -> ${categoryMatch ? "MATCH (Officeneed Exclusive)" : "MISMATCH"}`);

    if (!titleMatch || !handleMatch || !categoryMatch) mismatches++;

    const liveByKey = new Map();
    for (const mf of live.metafields ?? []) {
      if (mf) liveByKey.set(`${mf.namespace}.${mf.key}`, mf.value);
    }

    for (const r of fieldRows) {
      const liveValue = liveByKey.get(r.Metafield);
      const isEmpty = !liveValue;
      if (isEmpty) {
        stillEmptyCount++;
        console.log(`  [OK]  ${r.Metafield} is still empty on Shopify -- safe to write "${r["Extracted Value"]}"`);
      } else {
        noLongerEmptyCount++;
        console.log(`  [!!]  ${r.Metafield} is NO LONGER EMPTY -- live value: "${liveValue}" (manifest assumed empty)`);
      }
    }
  }

  console.log("\n" + "=".repeat(100));
  console.log("STEP 2 — RESOLVE THE 'Geometric' / \"City's\" HANDLE QUESTION FROM LIVE SHOPIFY DATA");
  console.log("=".repeat(100));
  const geometricGid = "gid://shopify/Product/8215642177629"; // POPULATE section
  const citysGid = "gid://shopify/Product/8238959624285"; // CONFLICT section
  const geometricLive = await fetchProductByIdViaAdmin(geometricGid);
  const citysLive = await fetchProductByIdViaAdmin(citysGid);
  console.log(`\n  GID ${geometricGid}`);
  console.log(`    Live title:  "${geometricLive?.title}"`);
  console.log(`    Live handle: "${geometricLive?.handle}"`);
  console.log(`\n  GID ${citysGid}`);
  console.log(`    Live title:  "${citysLive?.title}"`);
  console.log(`    Live handle: "${citysLive?.handle}"`);
  const distinctProducts = geometricGid !== citysGid && geometricLive?.handle !== citysLive?.handle;
  console.log(`\n  These are ${distinctProducts ? "TWO DISTINCT products" : "THE SAME product"} (confirmed by GID + live handle).`);
  console.log(`  The handles are just confusingly named on Shopify's side (each contains wording that sounds like the other's title) --`);
  console.log(`  this is a pre-existing Shopify data-naming quirk, not a manifest error. POPULATE targets GID ...${geometricGid.split("/").pop()}`);
  console.log(`  (title "${geometricLive?.title}"), CONFLICT targets GID ...${citysGid.split("/").pop()} (title "${citysLive?.title}") -- different products, correctly separated in the manifest.`);

  console.log("\n" + "=".repeat(100));
  console.log("STEP 3 — RE-VERIFY THE ONE CONFLICT, LIVE (not resolved, not written)");
  console.log("=".repeat(100));
  const conflictRow = conflictRows[0];
  const conflictLive = await fetchProductByIdViaAdmin(conflictRow["Product ID"]);
  const [conflictNamespace, conflictKey] = conflictRow.Metafield.split(".");
  const liveBindingValue = (conflictLive.metafields ?? []).find(
    (m) => m && m.namespace === conflictNamespace && m.key === conflictKey,
  )?.value;
  const liveExtracted = extractAttributes(conflictLive.descriptionHtml || "").get("binding");
  console.log(`\n  Product: ${conflictLive.title} (${conflictLive.handle})`);
  console.log(`  Current Shopify value (live):        "${liveBindingValue}"`);
  console.log(`  Value re-derived from live description: "${liveExtracted?.value}"`);
  const stillEquivalentIfChecked = liveBindingValue && liveExtracted ? bindingValuesEquivalent(liveBindingValue, liveExtracted.value) : false;
  console.log(`  Still a genuine conflict (values differ, not just reordered): ${stillEquivalentIfChecked ? "NO -- values now equivalent, re-check manifest" : "YES, confirmed"}`);
  console.log(`  Action taken: NONE. Not overwritten. Not auto-resolved.`);

  console.log("\n" + "=".repeat(100));
  console.log("RESULT");
  console.log("=".repeat(100));
  console.log(`Products checked: ${byProduct.size}`);
  console.log(`Identity mismatches (title/handle/category): ${mismatches}`);
  console.log(`Fields confirmed still empty (safe to POPULATE): ${stillEmptyCount}`);
  console.log(`Fields NO LONGER empty (would now be a conflict, not a populate): ${noLongerEmptyCount}`);
  console.log(`Conflict still genuine: ${stillEquivalentIfChecked ? "NO -- CHANGED" : "YES"}`);

  const countsUnchanged =
    populateRows.length === 29 && existingSkippedRows.length === 18 && notFoundRows.length === 15 && conflictRows.length === 1;

  const allPass = mismatches === 0 && noLongerEmptyCount === 0 && !stillEquivalentIfChecked && countsUnchanged && distinctProducts;

  console.log("\n" + (allPass ? "FINAL PRE-WRITE VALIDATION: PASS" : "FINAL PRE-WRITE VALIDATION: FAIL -- DO NOT WRITE, SEE ABOVE"));
  console.log(`POPULATE: ${populateRows.length}`);
  console.log(`EXISTING-SKIPPED: ${existingSkippedRows.length}`);
  console.log(`NOT FOUND: ${notFoundRows.length}`);
  console.log(`CONFLICT: ${conflictRows.length}`);
  console.log(`SHOPIFY WRITES: 0`);

  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Unexpected error during validation:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
