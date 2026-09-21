#!/usr/bin/env node
/**
 * READ-ONLY Admin API verification -- run this before ever setting
 * DRY_RUN=false. Confirms:
 *   1. Client Credentials Grant authentication succeeds.
 *   2. The token resolves to the correct store (har1k4-di.myshopify.com).
 *   3. The token carries read_products and write_products.
 *   4. A real, safe, read-only product query succeeds.
 *
 * Performs ZERO writes -- no metafieldsSet call anywhere in this file.
 * Never logs the client secret or the access token.
 *
 * Usage: node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/metafield-migration/verify-admin-auth.mjs
 */
import { hasAdminCredentials, missingAdminCredentials } from "./shopify-auth.mjs";
import { verifyAdminAccess, fetchProductsViaAdmin } from "./shopify-client.mjs";

const EXPECTED_DOMAIN = "har1k4-di.myshopify.com";
const REQUIRED_SCOPES = ["read_products", "write_products"];

async function main() {
  console.log("Shopify Admin API verification -- READ-ONLY, zero writes.\n");

  if (!hasAdminCredentials()) {
    console.log("Admin API authentication: FAIL");
    console.log(`  Missing environment variable(s): ${missingAdminCredentials().join(", ")}`);
    console.log("\nStore verified: NOT RUN");
    console.log("Required scopes verified: NOT RUN");
    console.log("Read-only Admin API test: NOT RUN");
    console.log("\nNo Shopify Admin API request was made.");
    process.exitCode = 1;
    return;
  }

  let access;
  try {
    access = await verifyAdminAccess();
    console.log("Admin API authentication: PASS");
  } catch (err) {
    console.log("Admin API authentication: FAIL");
    console.log(`  ${err instanceof Error ? err.message : String(err)}`);
    console.log("\nStore verified: NOT RUN");
    console.log("Required scopes verified: NOT RUN");
    console.log("Read-only Admin API test: NOT RUN");
    process.exitCode = 1;
    return;
  }

  const storeMatches = access.shopDomain === EXPECTED_DOMAIN;
  console.log(`Store verified: ${storeMatches ? "PASS" : "FAIL"}`);
  console.log(`  Shop name: ${access.shopName}`);
  console.log(`  Shop domain: ${access.shopDomain} (expected ${EXPECTED_DOMAIN})`);

  const missingScopes = REQUIRED_SCOPES.filter((s) => !access.scopes.includes(s));
  const scopesOk = missingScopes.length === 0;
  console.log(`Required scopes verified: ${scopesOk ? "PASS" : "FAIL"}`);
  console.log(`  Granted scopes: ${access.scopes.join(", ") || "(none)"}`);
  if (!scopesOk) console.log(`  Missing: ${missingScopes.join(", ")}`);

  let readTestOk = false;
  let products = [];
  try {
    products = await fetchProductsViaAdmin(3);
    readTestOk = true;
    console.log("Read-only Admin API test: PASS");
    products.forEach((p) => console.log(`  - ${p.title} (${p.handle})`));
  } catch (err) {
    console.log("Read-only Admin API test: FAIL");
    console.log(`  ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("\n" + "=".repeat(60));
  const allPass = storeMatches && scopesOk && readTestOk;
  console.log(allPass ? "ALL CHECKS PASSED" : "ONE OR MORE CHECKS FAILED -- do not proceed to a write run.");
  console.log("Zero Shopify writes were performed by this script.");
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Unexpected error during verification:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
