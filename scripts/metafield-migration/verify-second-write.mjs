#!/usr/bin/env node
/**
 * READ-ONLY post-write verification for the second write attempt (24
 * fields). Compares live Shopify values (fetched fresh via Admin API)
 * against the pre-write snapshot CSV (the approved expected values) for:
 *   - the 24 just-written fields
 *   - the original 5 fields written in the first attempt (must be unchanged)
 *   - the 1 CONFLICT field (must be unchanged)
 *   - a sample of EXISTING-SKIPPED / NOT FOUND fields (must be unaffected)
 *
 * Calls no mutation. metafieldsSet does not appear in this file.
 */
import { readFileSync } from "node:fs";
import { fetchProductByIdViaAdmin } from "./shopify-client.mjs";

const SNAPSHOT_PATH = process.argv[2];
if (!SNAPSHOT_PATH) {
  console.error("Usage: node verify-second-write.mjs <pre-write-snapshot.csv>");
  process.exit(1);
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

// The 5 fields from the FIRST write attempt (Kraft Cover Wiro Notebook) --
// hardcoded here as the approved expected values from that manifest, since
// they predate this snapshot file.
const FIRST_ATTEMPT_GID = "gid://shopify/Product/8224971259997";
const FIRST_ATTEMPT_PRODUCT = "Officeneed Kraft Cover Wiro Notebook – Ruled";
const FIRST_ATTEMPT_EXPECTED = [
  { metafield: "product_common.brand", value: "Officeneed" },
  { metafield: "product_common.product_type", value: "Wiro Notebook (No. 8)" },
  { metafield: "product_stationery.paper_weight", value: "100gsm" },
  { metafield: "product_stationery.ruling", value: "Ruled (with date field)" },
  { metafield: "product_stationery.binding", value: "Kraft/Brown, Uncoated, Wiro (Spiral) Binding" },
];

const CONFLICT_GID = "gid://shopify/Product/8238959624285";
const CONFLICT_PRODUCT = "Officeneed Unruled Wiro Book Flexible - City's";
const CONFLICT_FIELD = "product_stationery.binding";
const CONFLICT_EXPECTED_UNCHANGED = "Wiro binding, 270 GSM non-tearable PVC cover";

async function getLiveValue(gid, metafield) {
  const [namespace, key] = metafield.split(".");
  const product = await fetchProductByIdViaAdmin(gid);
  const mf = (product.metafields ?? []).find((m) => m && m.namespace === namespace && m.key === key);
  return { product, value: mf?.value };
}

async function main() {
  const rows = parseCsv(readFileSync(SNAPSHOT_PATH, "utf8"));
  const populateRows = rows.filter((r) => r.Action === "POPULATE");
  const existingSkippedRows = rows.filter((r) => r.Action === "EXISTING — SKIPPED");
  const notFoundRows = rows.filter((r) => r.Action === "NOT FOUND");

  console.log("READ-ONLY post-write verification. No mutation performed by this script.\n");

  // Group the 24 POPULATE rows by product GID to minimize repeat fetches.
  const byProduct = new Map();
  for (const r of populateRows) {
    if (!byProduct.has(r["Product ID"])) byProduct.set(r["Product ID"], { product: r.Product, rows: [] });
    byProduct.get(r["Product ID"]).rows.push(r);
  }

  console.log("=".repeat(110));
  console.log("THE 24 JUST-WRITTEN FIELDS");
  console.log("=".repeat(110));
  let pass24 = 0;
  const results = [];
  for (const [gid, { product, rows: fieldRows }] of byProduct) {
    const live = await fetchProductByIdViaAdmin(gid);
    const liveByKey = new Map((live.metafields ?? []).filter(Boolean).map((m) => [`${m.namespace}.${m.key}`, m.value]));
    for (const r of fieldRows) {
      const stored = liveByKey.get(r.Metafield);
      const expected = r["Extracted Value"];
      const match = stored === expected;
      if (match) pass24++;
      results.push({ product, metafield: r.Metafield, stored, expected, match });
      console.log(
        `  ${match ? "PASS" : "FAIL"}  ${product} | ${r.Metafield}\n        stored:   "${stored}"\n        expected: "${expected}"`,
      );
    }
  }

  console.log("\n" + "=".repeat(110));
  console.log("THE ORIGINAL 5 FIELDS FROM THE FIRST WRITE ATTEMPT (must be unchanged)");
  console.log("=".repeat(110));
  let pass5 = 0;
  const firstLive = await fetchProductByIdViaAdmin(FIRST_ATTEMPT_GID);
  const firstLiveByKey = new Map((firstLive.metafields ?? []).filter(Boolean).map((m) => [`${m.namespace}.${m.key}`, m.value]));
  for (const f of FIRST_ATTEMPT_EXPECTED) {
    const stored = firstLiveByKey.get(f.metafield);
    const match = stored === f.value;
    if (match) pass5++;
    console.log(`  ${match ? "PASS" : "FAIL"}  ${FIRST_ATTEMPT_PRODUCT} | ${f.metafield}\n        stored:   "${stored}"\n        expected: "${f.value}"`);
  }

  console.log("\n" + "=".repeat(110));
  console.log("THE 1 CONFLICT FIELD (must remain exactly as before, untouched)");
  console.log("=".repeat(110));
  const conflictLive = await fetchProductByIdViaAdmin(CONFLICT_GID);
  const [cNs, cKey] = CONFLICT_FIELD.split(".");
  const conflictStored = (conflictLive.metafields ?? []).find((m) => m && m.namespace === cNs && m.key === cKey)?.value;
  const conflictMatch = conflictStored === CONFLICT_EXPECTED_UNCHANGED;
  console.log(`  ${conflictMatch ? "PASS (unchanged)" : "FAIL (CHANGED!)"}  ${CONFLICT_PRODUCT} | ${CONFLICT_FIELD}`);
  console.log(`        stored:   "${conflictStored}"`);
  console.log(`        expected (unchanged): "${CONFLICT_EXPECTED_UNCHANGED}"`);

  console.log("\n" + "=".repeat(110));
  console.log(`SAMPLE CHECK: 3 EXISTING-SKIPPED fields (must be unaffected, spot-checked)`);
  console.log("=".repeat(110));
  let skippedOk = 0;
  const sampleSkipped = existingSkippedRows.slice(0, 3);
  for (const r of sampleSkipped) {
    const { value } = await getLiveValue(r["Product ID"], r.Metafield);
    const match = value === r["Existing Value"];
    if (match) skippedOk++;
    console.log(`  ${match ? "PASS" : "FAIL"}  ${r.Product} | ${r.Metafield} -> "${value}" (expected unchanged "${r["Existing Value"]}")`);
  }

  console.log("\n" + "=".repeat(110));
  console.log(`SAMPLE CHECK: 3 NOT FOUND fields (must remain blank)`);
  console.log("=".repeat(110));
  let notFoundOk = 0;
  const sampleNotFound = notFoundRows.slice(0, 3);
  for (const r of sampleNotFound) {
    const { value } = await getLiveValue(r["Product ID"], r.Metafield);
    const match = !value;
    if (match) notFoundOk++;
    console.log(`  ${match ? "PASS" : "FAIL"}  ${r.Product} | ${r.Metafield} -> "${value ?? "(blank)"}" (expected blank)`);
  }

  console.log("\n" + "=".repeat(110));
  console.log("SUMMARY");
  console.log("=".repeat(110));
  console.log(`24 just-written fields verified: ${pass24}/24 PASS`);
  console.log(`5 original fields unchanged: ${pass5}/5 PASS`);
  console.log(`Conflict field unchanged: ${conflictMatch ? "PASS" : "FAIL"}`);
  console.log(`EXISTING-SKIPPED sample unaffected: ${skippedOk}/${sampleSkipped.length} PASS`);
  console.log(`NOT FOUND sample still blank: ${notFoundOk}/${sampleNotFound.length} PASS`);

  const allPass = pass24 === 24 && pass5 === 5 && conflictMatch && skippedOk === sampleSkipped.length && notFoundOk === sampleNotFound.length;
  console.log("\n" + (allPass ? "VERIFICATION: PASS" : "VERIFICATION: FAIL -- see rows above"));
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
