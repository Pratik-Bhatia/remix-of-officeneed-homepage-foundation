/**
 * Key Features vs Product Details de-duplication.
 *
 * Mirrors the same duplicate-detection approach already validated against
 * live data (all 9 Officeneed Exclusive products) in the metafield
 * migration's audit tooling (scripts/metafield-migration/key-features-audit.mjs)
 * -- reimplemented here for the app's runtime rather than imported, since
 * scripts/metafield-migration is standalone Node tooling and isn't part of
 * the bundled app. Behavior is intentionally the same:
 *
 * - a bullet that just restates a Product Details value -> dropped
 * - a bullet that restates a value AND states a genuine benefit -> keep only the benefit
 * - a bullet with no overlap with Product Details -> kept as-is
 *
 * Never invents wording -- the "benefit" kept is always a verbatim
 * substring of the original bullet, never rewritten or embellished.
 */

export type Specification = { label: string; value: string };

function splitHtmlToLines(html: string): string[] {
  return html
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div|ul)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "")
    .trim();
}

const DASH_SPLIT_RE = /\s[–—-]\s/;

/**
 * A bullet "matches" a spec value if it contains the whole value, or (for
 * combined values like "Wiro binding, 270 GSM non-tearable PVC cover")
 * contains at least one real component of it. Component splitting happens
 * on the RAW value (before comma-stripping normalization removes the very
 * commas being split on).
 */
function bulletMatchesSpecValue(bulletNorm: string, specValueRaw: string): boolean {
  const specValueNorm = normalize(specValueRaw);
  if (!specValueNorm) return false;
  if (bulletNorm.includes(specValueNorm)) return true;
  const components = specValueRaw
    .split(",")
    .map((c) => normalize(c))
    .filter((c) => c.length > 3);
  return components.some((c) => bulletNorm.includes(c));
}

/**
 * Given the raw "Key Features" HTML from a product's description and its
 * already-resolved Product Details (product.specifications), returns only
 * the bullets -- or the benefit-only portion of a bullet -- that add
 * information beyond what Product Details already shows.
 */
export function deriveKeyFeatures(rawKeyFeaturesHtml: string, specifications: Specification[]): string[] {
  const bullets = splitHtmlToLines(rawKeyFeaturesHtml);
  const specValues = specifications.map((s) => s.value).filter(Boolean);
  if (specValues.length === 0) return bullets;

  const result: string[] = [];
  for (const bullet of bullets) {
    const bulletNorm = normalize(bullet);
    const isDuplicate = specValues.some((v) => bulletMatchesSpecValue(bulletNorm, v));

    if (!isDuplicate) {
      result.push(bullet);
      continue;
    }

    const parts = bullet.split(DASH_SPLIT_RE);
    if (parts.length >= 2) {
      const benefit = parts.slice(1).join(" - ").trim();
      if (benefit.replace(/[^a-z0-9]/gi, "").length >= 8) {
        result.push(benefit);
      }
      // else: dash-split but nothing substantive beyond the spec -- drop.
    }
    // else: a plain "Label: value" bullet with no dash -- fully represented
    // by Product Details already, so it's dropped rather than kept as noise.
  }
  return result;
}
