/**
 * Product search: a general, catalogue-agnostic relevance engine over the
 * product data already available to the storefront (no extra Shopify
 * fields fetched, no Admin API, entirely client-side over the already-loaded
 * catalogue). Nothing here is specific to any query, category or product --
 * every behavior below falls out of the same algorithm run against whatever
 * `products` list is passed in (already scoped to the active
 * category/collection by the caller).
 *
 * ARCHITECTURE
 *
 * 1. Word-boundary-safe field matching. A query token only counts as
 *    present in a field when it matches a WHOLE WORD of that field, or is a
 *    prefix of one (so partial typing like "note" still reaches
 *    "notebook") -- never a mid-word substring. Plain `.includes()` on raw
 *    text was the root cause of "ink" (from a "black ink" search) matching
 *    inside the unrelated tag "drinkware": this is a general class of bug,
 *    not a one-off, so it's fixed once at the matching primitive, not per
 *    query.
 *
 * 2. A four-tier field hierarchy, every field weighted once here and never
 *    special-cased per category:
 *      Tier 1 (strongest): exact title / exact phrase in title, product
 *        type, variant titles (e.g. a "Black" color variant).
 *      Tier 2: handle, tags, structured Product Details (specifications +
 *        materials), vendor/brand.
 *      Tier 3: the site's own category/subcategory classification.
 *      Tier 4 (weak, supporting only): free-text description and Key
 *        Features/marketing copy.
 *    Tiers 1-3 are what "real evidence" means throughout this file; Tier 4
 *    can only ever add to a score, never establish relevance on its own for
 *    multi-word queries.
 *
 * 3. Catalogue-driven discriminative weighting (IDF). Every query token's
 *    per-field weight is scaled by how rare that token actually is across
 *    the current product scope: a token that appears in a handful of
 *    products (e.g. "ink") counts far more than one that appears in
 *    hundreds (e.g. "black"/"premium"/"office"). This is computed fresh
 *    from whatever catalogue is passed in -- no hardcoded list of colors,
 *    attributes or product types, so it keeps working for categories and
 *    products added in the future without code changes.
 *
 * 4. Multi-word coherence gate. For a 2+ word query, a product only
 *    qualifies as a strong result once EVERY token has Tier 1-3 evidence
 *    (or the exact phrase hits the title) -- a token that only appears in
 *    the description does not satisfy its own requirement, so "Black
 *    Office Mug" cannot qualify for "black ink" merely because its
 *    description happens to mention ink-adjacent words. If nothing in the
 *    catalogue clears that bar, the gate relaxes in graduated steps (most
 *    tokens covered, then any real match at all) rather than ever forcing
 *    a hard empty state -- precision first, but never zero recall when
 *    genuine partial evidence exists.
 *
 * 5. Title proximity. When 2+ tokens both land in the title, they score
 *    higher the closer together they appear -- "Black Ink Pen" scores
 *    higher than a hypothetical title where the two words are far apart.
 *
 * 6. Fuzzy (edit-distance) matching only ever runs for a token with ZERO
 *    direct hits anywhere in the catalogue, and only against real
 *    catalogue vocabulary drawn from Tier 1-3 fields -- so a correction is
 *    always catalogue-backed, never a guess against arbitrary text.
 *    Edit-distance tolerance scales with word length (0 for <=3 chars, 1
 *    for 4-6, 2 for 7+), the same convention behind Elasticsearch's "AUTO"
 *    fuzziness, so short words like "pen"/"bag"/"ink" never fuzzy-match.
 */
import type { Product } from "./products";

export type SearchResult = { product: Product; score: number };
export type SearchOutcome = {
  results: SearchResult[];
  suggestion: string | null;
  usedFuzzy: boolean;
};

/** Base per-tier weights. Token-level weights (everything except the whole-
 * query structural bonuses) are further scaled by each token's catalogue
 * IDF multiplier at scoring time -- see `idfMultiplier`. */
const WEIGHT = {
  // Whole-query structural evidence -- not scaled by IDF, since these
  // already represent strong evidence about the query AS A WHOLE, not a
  // single token's raw frequency.
  exactTitle: 1000,
  phraseInTitle: 500,
  allTokensInTitle: 260,
  titleProximity: 120, // max bonus; decays with distance between matched title words
  splitRecombinationTitle: 240,

  // Tier 1 (title/type/variant) -- IDF-scaled.
  tokenInTitle: 90,
  tokenInType: 80,
  tokenInVariants: 70,

  // Tier 2 (handle/tags/details/vendor) -- IDF-scaled.
  tokenInTags: 55,
  tokenInDetails: 50,
  tokenInHandle: 35,
  tokenInVendor: 45,
  splitRecombinationOther: 80,

  // Tier 3 (site category/subcategory) -- IDF-scaled.
  tokenInCategory: 30,

  // Tier 4 (description/features) -- IDF-scaled, deliberately small: this
  // tier can only ever pad an already-qualifying product's score, since the
  // multi-word gate (see runProductSearch) never lets it establish
  // relevance by itself.
  phraseInDescription: 25,
  tokenInDescription: 10,

  // Fuzzy -- IDF-unscaled and kept below every real Tier 1-4 weight, so a
  // guess never outranks a certainty.
  fuzzyTitle: 9,
  fuzzyOther: 6,
} as const;

const MIN_TOKEN_LENGTH = 2;

/** Lowercases, strips accents/punctuation, folds hyphens/underscores to
 * spaces -- but never collapses spaces themselves, so "gift set" stays two
 * words and never becomes "giftset". */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents (café -> cafe)
    .replace(/[-_/]+/g, " ") // hyphens/underscores/slashes are word boundaries
    .replace(/[^a-z0-9\s]+/g, " ") // strip remaining punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/** Conservative singular/plural fold -- only for query tokens, so "diaries"
 * typed by a user still targets "diary"-titled products via variant expansion. */
function singularize(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && /(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Splits a normalized query into unique, meaningful (length >= 2) tokens. */
export function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of normalized.split(" ")) {
    const word = singularize(raw);
    if (word.length < MIN_TOKEN_LENGTH) continue;
    if (!seen.has(word)) {
      seen.add(word);
      tokens.push(word);
    }
  }
  return tokens;
}

/** A handful of exact-form variants for a token (singular/plural), used for
 * matching so "diary" reaches a title/tag literally saying "Diaries" and
 * vice versa -- without a heavy stemmer. */
function expandTokenVariants(token: string): string[] {
  const variants = new Set([token]);
  if (token.endsWith("y") && token.length > 2) variants.add(`${token.slice(0, -1)}ies`);
  else if (!token.endsWith("s")) variants.add(`${token}s`);
  if (token.endsWith("ies")) variants.add(`${token.slice(0, -3)}y`);
  if (token.endsWith("s") && token.length > 3) variants.add(token.slice(0, -1));
  return [...variants];
}

/** Whole-word-or-prefix match against a pre-split word list. This is the
 * single primitive every field check goes through -- it's what makes "ink"
 * match a field word "ink" or "inks", but NOT the middle of "drinkware".
 * Prefix matching (not just equality) is kept because it's what makes
 * partial typing ("note" -> "notebook") work, which is expected, normal
 * e-commerce search behavior. */
function wordListHasAny(words: readonly string[], variants: readonly string[]): boolean {
  return words.some((w) => variants.some((v) => w === v || w.startsWith(v)));
}

/** Restricted Damerau-Levenshtein (optimal string alignment): like
 * Levenshtein, but an adjacent transposition ("dairy" <-> "diary") costs a
 * single edit instead of two substitutions -- the single most common typo
 * shape, so this matters for real-world queries. */
function editDistance(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const d: number[][] = Array.from({ length: al + 1 }, () => new Array<number>(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i]![0] = i;
  for (let j = 0; j <= bl; j++) d[0]![j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1, // deletion
        d[i]![j - 1]! + 1, // insertion
        d[i - 1]![j - 1]! + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + cost); // adjacent transposition
      }
    }
  }
  return d[al]![bl]!;
}

/** Normalized 0..1 similarity between two already-normalized words. */
export function calculateTextSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - editDistance(a, b) / maxLen;
}

/** How many edits a word of this length may be off by before a fuzzy match
 * is rejected. 0 for very short words ("pen"/"bag"/"ink" never fuzzy-match:
 * required behavior), 1 for medium words, 2 for longer ones. */
function maxEditDistanceFor(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
}

function fuzzyTokenMatch(token: string, candidate: string): { matched: boolean; similarity: number } {
  const threshold = maxEditDistanceFor(token.length);
  if (threshold === 0) {
    return token === candidate ? { matched: true, similarity: 1 } : { matched: false, similarity: 0 };
  }
  if (Math.abs(token.length - candidate.length) > threshold) return { matched: false, similarity: 0 };
  const distance = editDistance(token, candidate);
  return { matched: distance <= threshold, similarity: 1 - distance / Math.max(token.length, candidate.length) };
}

const wordsOf = (text: string): string[] => (text ? text.split(" ").filter(Boolean) : []);

type SearchableFields = {
  title: string;
  titleWords: string[];
  handle: string;
  handleWords: string[];
  description: string;
  descriptionWords: string[];
  type: string;
  typeWords: string[];
  vendor: string;
  vendorWords: string[];
  tags: string;
  tagsWords: string[];
  details: string;
  detailsWords: string[];
  variants: string;
  variantsWords: string[];
  category: string;
  categoryWords: string[];
  /** Tier 1-3 fields only (never description/features) -- what "does this
   * catalogue have ANY real evidence for this token" is checked against. */
  highSignalWords: string[];
  /** All fields including description -- used only to decide whether a
   * token needs the fuzzy/recombination treatment at all (see
   * runProductSearch): if it's a real word ANYWHERE, even in a
   * description, it isn't a typo. */
  allWords: string[];
};

export function buildSearchableFields(product: Product): SearchableFields {
  const title = normalizeSearchText(product.name);
  const handle = normalizeSearchText(product.slug.replace(/-/g, " "));
  const description = normalizeSearchText(`${product.description ?? ""} ${product.summary ?? ""} ${(product.features ?? []).join(" ")}`);
  const type = normalizeSearchText(product.productType ?? "");
  const vendor = normalizeSearchText(product.vendor ?? "");
  const tags = normalizeSearchText((product.tags ?? []).join(" "));
  const details = normalizeSearchText(
    [...(product.specifications ?? []).flatMap((s) => [s.label, s.value]), ...(product.materials ?? [])].join(" "),
  );
  const variants = normalizeSearchText((product.variants ?? []).join(" "));
  const category = normalizeSearchText([product.category, ...(product.subcategories ?? [])].join(" "));

  const titleWords = wordsOf(title);
  const handleWords = wordsOf(handle);
  const descriptionWords = wordsOf(description);
  const typeWords = wordsOf(type);
  const vendorWords = wordsOf(vendor);
  const tagsWords = wordsOf(tags);
  const detailsWords = wordsOf(details);
  const variantsWords = wordsOf(variants);
  const categoryWords = wordsOf(category);

  const highSignalWords = Array.from(
    new Set([...titleWords, ...handleWords, ...typeWords, ...vendorWords, ...tagsWords, ...detailsWords, ...variantsWords, ...categoryWords].filter((w) => w.length >= 3)),
  );
  const allWords = Array.from(new Set([...highSignalWords, ...descriptionWords.filter((w) => w.length >= 3)]));

  return {
    title, titleWords, handle, handleWords, description, descriptionWords,
    type, typeWords, vendor, vendorWords, tags, tagsWords, details, detailsWords,
    variants, variantsWords, category, categoryWords, highSignalWords, allWords,
  };
}

/** Finds a two-word split of a single concatenated token that's actually
 * present as a phrase somewhere in the catalogue's high-signal fields --
 * e.g. "giftset" -> "gift set", so a query typed without a space still
 * reaches products whose real data has that space (never the other way
 * around: we never strip spaces from product data or the query). Checked
 * against the raw (unsplit) high-signal text since this is itself a
 * multi-word phrase, not a single token -- a 2-word phrase landing as a
 * substring is not the same false-positive risk as a single short token. */
function findSplitRecombination(token: string, allHighSignalText: string[]): string | null {
  if (token.length < 6) return null;
  for (let i = 2; i <= token.length - 2; i++) {
    const phrase = `${token.slice(0, i)} ${token.slice(i)}`;
    if (allHighSignalText.some((t) => t.includes(phrase))) return phrase;
  }
  return null;
}

/**
 * Catalogue-driven discriminative weight for a token: rare tokens (present
 * in few products) count for more than common ones ("black"/"premium"),
 * computed fresh from whatever catalogue scope is passed in -- never a
 * hardcoded list. `df` is the number of products with Tier 1-3 evidence for
 * this token; `n` is the number of products in scope.
 */
function idfMultiplier(df: number, n: number): number {
  if (n <= 0 || df <= 0) return 1;
  const idf = Math.log((n + 1) / (df + 1)) + 1; // smoothed idf, always > 0
  return Math.min(2.2, Math.max(0.4, idf));
}

/**
 * Scores a single product against a tokenized query.
 * `tokenIdf` gives each token's catalogue-driven weight multiplier (see
 * idfMultiplier). `fuzzyTokens` marks tokens with zero direct hits anywhere
 * in the catalogue (worth the fuzzy pass); `recombinations` maps a token to
 * a catalogue-verified two-word split. Returns 0 score for no match at all.
 */
export function scoreProductSearchMatch(
  fields: SearchableFields,
  queryTokens: string[],
  normalizedQuery: string,
  tokenIdf: ReadonlyMap<string, number> = new Map(),
  fuzzyTokens: ReadonlySet<string> = new Set(),
  recombinations: ReadonlyMap<string, string> = new Map(),
): {
  score: number;
  fuzzyHit: boolean;
  fuzzyCorrections: Array<{ token: string; word: string; similarity: number }>;
  /** Which query tokens found real (Tier 1-3) evidence in this product. */
  highSignalHitTokens: Set<string>;
  /** Which query tokens found ANY evidence at all, including description. */
  anyHitTokens: Set<string>;
  /** Whether the exact phrase (or, for a single word, the exact title) hit --
   * always strong enough to bypass the coherence gate on its own. */
  exactOrPhraseTitleHit: boolean;
} {
  let score = 0;
  let fuzzyHit = false;
  const fuzzyCorrections: Array<{ token: string; word: string; similarity: number }> = [];
  let exactOrPhraseTitleHit = false;
  const highSignalHitTokens = new Set<string>();
  const anyHitTokens = new Set<string>();
  const idf = (token: string) => tokenIdf.get(token) ?? 1;

  if (fields.title === normalizedQuery) { score += WEIGHT.exactTitle; exactOrPhraseTitleHit = true; }
  else if (queryTokens.length > 1 && fields.title.includes(normalizedQuery)) { score += WEIGHT.phraseInTitle; exactOrPhraseTitleHit = true; }

  let titleTokenHits = 0;
  const titleMatchPositions: number[] = [];

  for (const token of queryTokens) {
    const variants = expandTokenVariants(token);
    const w = idf(token);
    const inTitle = wordListHasAny(fields.titleWords, variants);
    const inHandle = wordListHasAny(fields.handleWords, variants);
    const inType = wordListHasAny(fields.typeWords, variants);
    const inVendor = wordListHasAny(fields.vendorWords, variants);
    const inTags = wordListHasAny(fields.tagsWords, variants);
    const inDetails = wordListHasAny(fields.detailsWords, variants);
    const inVariants = wordListHasAny(fields.variantsWords, variants);
    const inCategory = wordListHasAny(fields.categoryWords, variants);
    const inDescription = wordListHasAny(fields.descriptionWords, variants);

    if (inTitle) {
      score += WEIGHT.tokenInTitle * w;
      titleTokenHits++;
      const pos = fields.titleWords.findIndex((tw) => variants.some((v) => tw === v || tw.startsWith(v)));
      if (pos !== -1) titleMatchPositions.push(pos);
    }
    if (inType) score += WEIGHT.tokenInType * w;
    if (inVariants) score += WEIGHT.tokenInVariants * w;
    if (inHandle) score += WEIGHT.tokenInHandle * w;
    if (inTags) score += WEIGHT.tokenInTags * w;
    if (inDetails) score += WEIGHT.tokenInDetails * w;
    if (inVendor) score += WEIGHT.tokenInVendor * w;
    if (inCategory) score += WEIGHT.tokenInCategory * w;
    if (inDescription) score += WEIGHT.tokenInDescription * w;

    let tokenHasHighSignalHit = inTitle || inType || inVariants || inHandle || inTags || inDetails || inVendor || inCategory;
    const anyDirectHit = tokenHasHighSignalHit || inDescription;

    if (!anyDirectHit) {
      const recombined = recombinations.get(token);
      if (recombined && fields.title.includes(recombined)) {
        score += WEIGHT.splitRecombinationTitle;
        tokenHasHighSignalHit = true;
      } else if (
        recombined &&
        [fields.handle, fields.type, fields.vendor, fields.tags, fields.details, fields.variants, fields.category].some((f) => f.includes(recombined))
      ) {
        score += WEIGHT.splitRecombinationOther;
        tokenHasHighSignalHit = true;
      } else if (fuzzyTokens.has(token)) {
        let best: { word: string; similarity: number; inTitle: boolean } | null = null;
        for (const word of fields.highSignalWords) {
          const { matched, similarity } = fuzzyTokenMatch(token, word);
          if (matched && (!best || similarity > best.similarity)) {
            best = { word, similarity, inTitle: fields.titleWords.includes(word) };
          }
        }
        if (best) {
          fuzzyHit = true;
          fuzzyCorrections.push({ token, word: best.word, similarity: best.similarity });
          score += (best.inTitle ? WEIGHT.fuzzyTitle : WEIGHT.fuzzyOther) * best.similarity;
          tokenHasHighSignalHit = true; // fuzzy candidates are only ever drawn from Tier 1-3 fields
        }
      }
    }

    if (tokenHasHighSignalHit) highSignalHitTokens.add(token);
    if (tokenHasHighSignalHit || inDescription) anyHitTokens.add(token);
  }

  if (queryTokens.length > 1 && titleTokenHits === queryTokens.length) score += WEIGHT.allTokensInTitle;

  // Proximity: when 2+ query tokens both land in the title, reward them for
  // appearing close together -- "Black Ink Pen" beats a title where the
  // same two words are far apart. Decays linearly with the gap and never
  // goes negative; only kicks in once the phrase/all-tokens bonuses above
  // don't already cover the case (a contiguous phrase already scores far
  // higher via WEIGHT.phraseInTitle).
  if (titleMatchPositions.length > 1) {
    const span = Math.max(...titleMatchPositions) - Math.min(...titleMatchPositions) + 1;
    const gap = Math.max(0, span - titleMatchPositions.length);
    score += Math.max(0, WEIGHT.titleProximity - gap * 30);
  }

  if (queryTokens.length > 1 && fields.description.includes(normalizedQuery)) score += WEIGHT.phraseInDescription;

  return { score, fuzzyHit, fuzzyCorrections, highSignalHitTokens, anyHitTokens, exactOrPhraseTitleHit };
}

/**
 * Core search pass: tokenizes the query, computes each token's catalogue-
 * wide discriminative weight and fuzzy-eligibility, scores every product,
 * and (only if some token had zero direct hits anywhere) works out a
 * high-confidence "did you mean" correction. This is what both
 * `searchProducts` and `getSearchSuggestion` run under the hood, so a page
 * that needs both only pays for one pass.
 */
export function runProductSearch(products: Product[], rawQuery: string): SearchOutcome {
  const normalizedQuery = normalizeSearchText(rawQuery);
  const queryTokens = tokenizeSearchQuery(rawQuery);
  if (queryTokens.length === 0) return { results: [], suggestion: null, usedFuzzy: false };

  const indexed = products.map((product) => ({ product, fields: buildSearchableFields(product) }));
  const n = indexed.length;

  // One pass to establish, per token: catalogue document frequency (for
  // IDF), how many products have it IN THE TITLE specifically, whether it
  // needs the fuzzy pass (zero hits anywhere), and whether a split-
  // recombination phrase exists for it.
  const tokenIdf = new Map<string, number>();
  const titleDf = new Map<string, number>();
  const overallDf = new Map<string, number>();
  const fuzzyTokens = new Set<string>();
  const recombinations = new Map<string, string>();
  for (const token of queryTokens) {
    const variants = expandTokenVariants(token);
    let df = 0;
    let tdf = 0;
    let hasAnyHit = false;
    for (const { fields } of indexed) {
      if (wordListHasAny(fields.highSignalWords, variants)) df++;
      if (wordListHasAny(fields.titleWords, variants)) tdf++;
      if (!hasAnyHit && wordListHasAny(fields.allWords, variants)) hasAnyHit = true;
    }
    tokenIdf.set(token, idfMultiplier(df, n));
    titleDf.set(token, tdf);
    overallDf.set(token, df);
    if (hasAnyHit) continue;
    const recombined = findSplitRecombination(
      token,
      indexed.map((i) => [i.fields.title, i.fields.handle, i.fields.type, i.fields.vendor, i.fields.tags, i.fields.details, i.fields.variants, i.fields.category].join(" ")),
    );
    if (recombined) recombinations.set(token, recombined);
    else fuzzyTokens.add(token);
  }

  // A token that never appears in ANY product's title across the whole
  // catalogue, but does have real (Tier 1-3) support elsewhere, behaves
  // like a QUALIFIER rather than a product concept -- in this store that's
  // typically a color/attribute living only in variant options (e.g. "Red"),
  // never in the title itself. This is inferred purely from catalogue
  // frequency, never a hardcoded list of colors or attributes: if a future
  // category's data has "red" in real product titles, "red" becomes a hard
  // (required) token there instead, automatically. Hard tokens gate which
  // products qualify; soft tokens only ever add score, never exclude --
  // this is what stops "red notebook" from surfacing a red pen, keychain or
  // backpack that has zero "notebook" evidence anywhere, while still
  // letting a genuine red notebook (if one exists) rank at the very top.
  const hardTokenSet = new Set(
    queryTokens.filter((t) => (titleDf.get(t) ?? 0) > 0 || (overallDf.get(t) ?? 0) === 0),
  );
  // If literally every token is "soft" (e.g. a query of pure attribute
  // words with none appearing in any title), there is nothing to anchor a
  // product concept on -- fall back to treating all tokens as required,
  // rather than gating on nothing at all.
  const effectiveHardTokens = hardTokenSet.size > 0 ? [...hardTokenSet] : queryTokens;

  let usedFuzzy = false;
  // Two typo corrections can land on the same edit distance/similarity (e.g.
  // "dairy" is one edit from both "diary" and "daily") -- similarity alone
  // can't break that tie. Catalogue frequency can: count how many products
  // actually support each candidate word and prefer the one with real
  // support, so "dairy" resolves to whichever real vocabulary word the
  // catalogue actually backs, not whichever was scanned first.
  const correctionCandidates = new Map<string, Map<string, { count: number; similarity: number }>>();

  // Every scored product, tagged with which tokens it has real (Tier 1-3)
  // evidence for and which it has ANY evidence for at all -- this lets the
  // gate below relax in graduated steps instead of an all-or-nothing cliff,
  // while still never admitting a product with zero evidence for a hard
  // (product-concept) token.
  const scored: Array<{
    product: Product;
    score: number;
    highSignalHitTokens: Set<string>;
    anyHitTokens: Set<string>;
    exactOrPhraseTitleHit: boolean;
  }> = [];

  for (const { product, fields } of indexed) {
    const { score, fuzzyHit, fuzzyCorrections, highSignalHitTokens, anyHitTokens, exactOrPhraseTitleHit } = scoreProductSearchMatch(
      fields,
      queryTokens,
      normalizedQuery,
      tokenIdf,
      fuzzyTokens,
      recombinations,
    );
    if (fuzzyHit) usedFuzzy = true;
    for (const c of fuzzyCorrections) {
      const byWord = correctionCandidates.get(c.token) ?? new Map();
      const existing = byWord.get(c.word);
      byWord.set(c.word, { count: (existing?.count ?? 0) + 1, similarity: c.similarity });
      correctionCandidates.set(c.token, byWord);
    }
    if (score > 0) scored.push({ product, score, highSignalHitTokens, anyHitTokens, exactOrPhraseTitleHit });
  }

  // Multi-word coherence gate, applied in graduated steps so the result set
  // is always the STRONGEST tier that actually has something in it --
  // never a hard empty page when weaker evidence genuinely exists, but
  // never diluted with weak (or entirely absent) evidence when strong
  // matches are available. Only HARD (product-concept) tokens gate
  // inclusion; soft/qualifier tokens (see above) only ever add score.
  // Single-word queries skip straight through (the gate is trivially
  // satisfied when there's only one token to cover).
  let tiered: SearchResult[] = [];
  if (queryTokens.length < 2) {
    tiered = scored.map((r) => ({ product: r.product, score: r.score }));
  } else {
    const hardHitCount = (r: (typeof scored)[number]) => effectiveHardTokens.filter((t) => r.highSignalHitTokens.has(t)).length;
    // A product may never qualify while a hard token has literally ZERO
    // evidence anywhere (not even the description) -- this is what stops a
    // red pen/keychain/backpack (real "red" evidence, zero "notebook"
    // evidence anywhere) from surfacing for "red notebook" once "notebook"
    // is the only hard token and nothing forces the gate down further.
    const noHardTokenMissing = (r: (typeof scored)[number]) => effectiveHardTokens.every((t) => r.anyHitTokens.has(t));

    const full = scored.filter((r) => r.exactOrPhraseTitleHit || hardHitCount(r) === effectiveHardTokens.length);
    if (full.length > 0) {
      tiered = full;
    } else if (effectiveHardTokens.length > 1) {
      const majorityThreshold = Math.ceil(effectiveHardTokens.length / 2);
      const majority = scored.filter((r) => hardHitCount(r) >= majorityThreshold && noHardTokenMissing(r));
      tiered = majority.length > 0 ? majority : scored;
    } else {
      tiered = scored;
    }
    tiered = tiered.map((r) => ({ product: r.product, score: r.score }));
  }

  tiered.sort((a, b) => b.score - a.score || (a.product.featuredRank ?? 999) - (b.product.featuredRank ?? 999));

  let suggestion: string | null = null;
  if (correctionCandidates.size > 0) {
    const words = normalizedQuery.split(" ");
    let changed = false;
    const suggestedWords = words.map((wd) => {
      const byWord = correctionCandidates.get(wd);
      if (!byWord) return wd;
      const [best] = [...byWord.entries()].sort(
        ([wordA, a], [wordB, b]) => b.count - a.count || b.similarity - a.similarity || wordA.localeCompare(wordB),
      );
      if (best && best[1].similarity >= 0.6 && best[0] !== wd) {
        changed = true;
        return best[0];
      }
      return wd;
    });
    if (changed) suggestion = suggestedWords.join(" ");
  }

  return { results: tiered, suggestion, usedFuzzy };
}

/** Relevance-ranked products matching `query`. Empty query returns `products` untouched. */
export function searchProducts(products: Product[], query: string): Product[] {
  if (!query.trim()) return products;
  return runProductSearch(products, query).results.map((r) => r.product);
}

/** A high-confidence "did you mean" correction built from real product
 * vocabulary, or null when the query needs no correction (or none is
 * confident enough to suggest). Never auto-applied -- callers must let the
 * user explicitly accept it. */
export function getSearchSuggestion(products: Product[], query: string): string | null {
  if (!query.trim()) return null;
  return runProductSearch(products, query).suggestion;
}
