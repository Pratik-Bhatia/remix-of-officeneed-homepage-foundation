/**
 * Product-specific attribute extraction from Shopify description HTML.
 *
 * Pure text processing -- no network calls, no Shopify knowledge. Given a
 * product's descriptionHtml, returns ONLY the attributes actually present
 * in that specific product's text, each tagged with which raw label it
 * matched and a confidence level. Never invents a value: an attribute is
 * only returned if a "Label: value" line for it (or a recognized alias)
 * literally exists in the description.
 *
 * This intentionally does NOT decide which Shopify metafield an attribute
 * maps to, or whether that metafield is relevant for the product's
 * category -- that's product-details-schema.ts's job (via canonical key)
 * plus the migration runner's category check. This file only answers:
 * "what does this product's own description actually say?"
 */

// canonical attribute key -> accepted label aliases (case-insensitive).
// Kept deliberately narrow -- an ambiguous label is left unmatched rather
// than guessed. See README notes inline per field for why an alias was
// included or deliberately excluded.
export const ATTRIBUTE_ALIASES = {
  brand: ["brand", "manufacturer"],
  // "Type" alone is too ambiguous (could mean fragrance type, ruling type,
  // ink type, etc.) -- only the unambiguous full phrase is accepted.
  product_type: ["product type"],
  dimensions: ["size", "dimensions", "product size", "size / dimensions"],
  pages: ["pages", "number of pages", "total pages", "sheets"],
  // Bare "paper" is only accepted when the value itself looks like a GSM
  // weight (validated separately below) -- otherwise it's too likely to be
  // an unrelated "Paper: A4" (a size, not a weight) false positive.
  paper_weight: ["paper weight", "paper gsm", "gsm", "paper"],
  ruling: ["ruling", "page style"],
  binding: ["binding", "binding type", "cover"],
  material: ["material"],
};

const GSM_VALUE_RE = /^\s*\d{2,4}\s*gsm\b/i;

// Approved normalization #1: strip only a trailing unit word from Pages
// values (e.g. "250 pages" -> "250"). Never touches any other content --
// if the value isn't "<number> <unit>", it's left exactly as written.
const PAGES_SUFFIX_RE = /^(\d+)\s*(pages|page|sheets|sheet)$/i;

function normalizePagesValue(value) {
  const m = value.trim().match(PAGES_SUFFIX_RE);
  return m ? m[1] : value;
}

function stripHtmlToLines(html) {
  return html
    // Turn common block/line boundaries into newlines before stripping tags,
    // so "Brand: X<br>Type: Y" and "<li>Brand: X</li>" both become separate lines.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const LABEL_LINE_RE = /^([A-Za-z][A-Za-z /&']{1,30}?)\s*[:\-–]\s*(.+)$/;

/**
 * Binding-type mentions that appear as a bullet's leading phrase rather than
 * a clean "Label: value" line, e.g. "Wiro (Spiral) Binding – Allows pages to
 * open flat..." -- there is no colon, so LABEL_LINE_RE never sees this as a
 * label at all today, and the binding type is silently lost.
 *
 * Two deliberate guards keep this from being "aggressive keyword guessing":
 * 1. The ONLY anchor it matches on is the literal word "binding" or "bound"
 *    -- it never fires on "wiro"/"spiral"/etc alone.
 * 2. It only accepts the match when it is the LEADING phrase of the line
 *    (anchored at the start) -- the "Label – benefit" bullet convention
 *    this catalogue uses. This is what excludes an incidental mid-sentence
 *    mention buried in flowing marketing prose (e.g. "...paired with a
 *    durable wire binding that lets the notebook open flat...", which is
 *    context, not a clearly-labelled specification) while still accepting
 *    a bullet that IS the specification, stated up front.
 */
const BINDING_MENTION_RE = /^(?:[A-Za-z()/'-]+\s+){0,6}(?:[Bb]inding|[Bb]ound)\b/;

export function extractBindingMentions(line) {
  const m = line.match(BINDING_MENTION_RE);
  return m ? [m[0].trim()] : [];
}

/** Loose containment check used only to avoid re-adding a component that's already captured (case/spacing-insensitive). */
function alreadyCaptured(existingValue, candidate) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(existingValue).includes(norm(candidate)) || norm(candidate).includes(norm(existingValue));
}

const BINDING_STOPWORDS = new Set(["binding", "bound", "the", "and", "with", "durable", "strong"]);

/**
 * Two binding mentions can describe the exact same real fact in different
 * wording ("Spiral/Wire Bound" vs "Wiro (Spiral) Binding" are both "it's
 * spiral/wire bound"). Rather than concatenate near-duplicates, treat any
 * shared type-word (e.g. "spiral") as evidence it's the same fact already
 * captured -- conservative in the direction of NOT duplicating content, per
 * the "do not invent or rewrite factual content" rule (duplicating isn't
 * inventing, but it isn't useful either).
 */
export function describesSameBindingFact(existingValue, mention) {
  const words = (s) =>
    new Set((s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !BINDING_STOPWORDS.has(w)));
  const existingWords = words(existingValue);
  for (const w of words(mention)) {
    if (existingWords.has(w)) return true;
  }
  return false;
}

/**
 * @param descriptionHtml raw Shopify descriptionHtml for one product
 * @returns Map<canonicalKey, { value, rawLabel, confidence }>
 *   confidence: "high" (exact canonical term) | "medium" (alias match)
 */
export function extractAttributes(descriptionHtml) {
  const lines = stripHtmlToLines(descriptionHtml || "");
  const found = new Map();
  const structuredLineIndexes = new Set();

  // Pass 1: explicit "Label: value" lines (unchanged from before).
  lines.forEach((line, idx) => {
    const m = line.match(LABEL_LINE_RE);
    if (!m) return;
    const rawLabel = m[1].trim();
    let value = m[2].trim();
    if (!value) return;
    const labelLower = rawLabel.toLowerCase();

    for (const [canonicalKey, aliases] of Object.entries(ATTRIBUTE_ALIASES)) {
      if (!aliases.includes(labelLower)) continue;
      structuredLineIndexes.add(idx);

      // Guard against the ambiguous bare "paper" alias: only accept it when
      // the value is actually shaped like a paper weight (e.g. "100gsm").
      if (canonicalKey === "paper_weight" && labelLower === "paper" && !GSM_VALUE_RE.test(value)) {
        continue;
      }

      if (canonicalKey === "pages") {
        value = normalizePagesValue(value);
      }

      const confidence = labelLower === canonicalKey.replace(/_/g, " ") ? "high" : "medium";

      if (canonicalKey === "binding" && found.has("binding")) {
        // "Binding:" and "Cover:" are two different real lines that both
        // belong to the one combined "Binding / Cover" field -- concatenate
        // rather than dropping the second, since both are genuinely present.
        const existing = found.get("binding");
        found.set("binding", {
          value: `${existing.value}, ${value}`,
          rawLabel: `${existing.rawLabel} + ${rawLabel}`,
          confidence: existing.confidence === "high" && confidence === "high" ? "high" : "medium",
        });
      } else if (!found.has(canonicalKey)) {
        found.set(canonicalKey, { value, rawLabel, confidence });
      }
      break;
    }
  });

  // Pass 2: binding-type mentions in free-text/bullet lines that pass 1
  // didn't already consume as a structured "Label: value" line -- this is
  // what catches "Wiro (Spiral) Binding – Allows pages to open flat...".
  lines.forEach((line, idx) => {
    if (structuredLineIndexes.has(idx)) return; // already handled structurally, avoid double-counting
    for (const mention of extractBindingMentions(line)) {
      const existing = found.get("binding");
      if (existing && (alreadyCaptured(existing.value, mention) || describesSameBindingFact(existing.value, mention))) {
        continue; // same fact already captured, just worded differently
      }
      if (existing) {
        found.set("binding", {
          value: `${existing.value}, ${mention}`,
          rawLabel: `${existing.rawLabel} + Key Feature mention`,
          confidence: "medium",
        });
      } else {
        found.set("binding", { value: mention, rawLabel: "Key Feature mention", confidence: "medium" });
      }
    }
  });

  return found;
}

/**
 * Approved normalization #2: the Binding/Cover field is a concatenation of
 * whatever real "Binding:"/"Cover:" lines a description happens to contain,
 * in the order they appear in that text. Shopify's existing value may list
 * the same real components in a different order. This compares the two
 * value strings by their comma-separated components regardless of order --
 * it never adds, removes, or rewords a component, only reorders for the
 * purpose of equality comparison (used for CONFLICT detection, never to
 * change what gets written).
 */
export function bindingValuesEquivalent(a, b) {
  const normalize = (s) =>
    s
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .sort();
  const partsA = normalize(a);
  const partsB = normalize(b);
  return partsA.length === partsB.length && partsA.every((p, i) => p === partsB[i]);
}
