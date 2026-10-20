import { marked } from "marked";
import { parseDocument } from "htmlparser2";
import { getText, removeElement, replaceElement } from "domutils";
import render from "dom-serializer";
import type { Product } from "./products";

const fields = [
  { label: "Origin", key: "origin", aliases: ["Origin", "Country of Origin"] },
  { label: "Fragrance Family", key: "fragrance_family", aliases: ["Fragrance Family"] },
  { label: "Concentration", key: "concentration", aliases: ["Concentration"] },
  { label: "Size", key: "size", aliases: ["Size", "Volume"] },
  { label: "Gender", key: "gender", aliases: ["Gender"] },
  { label: "Top Notes", key: "top_notes", aliases: ["Top Notes", "Top Note"] },
  { label: "Heart Notes", key: "heart_notes", aliases: ["Heart Notes", "Heart Note", "Middle Notes"] },
  { label: "Base Notes", key: "base_notes", aliases: ["Base Notes", "Base Note"] },
] as const;

// Explicit supported scalar/list metafields; no inferred values from tags or names.
export const FRAGRANCE_METAFIELD_IDENTIFIERS = fields.flatMap(({ key }) =>
  ["product_fragrance", "fragrance", "custom"].map((namespace) => ({ namespace, key })),
);

function plain(value: string): string {
  return getText(parseDocument(value)).replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim();
}

function metafieldText(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed.map(plain).filter(Boolean).join(", ") || undefined;
    }
    // Reference/JSON objects are not displayable fragrance specifications.
    if (typeof parsed === "object" && parsed !== null) return undefined;
  } catch { /* Scalar text is Shopify's usual representation. */ }
  return plain(value) || undefined;
}

const labelPattern = fields.flatMap((field) => field.aliases).join("|");
const labelRegex = new RegExp(`(?:^|\\n|\\s)(?:[-•]\\s*)?(${labelPattern})\\s*:\\s*`, "gi");
const retainedLabelRegex = /(?:\n|\s)(Overall Character|Best For)\s*:/i;
const sectionHeading = /^(?:Product Details|Specifications|Technical Specifications|Fragrance Notes)\s*:?$/i;
const blockTags = new Set(["p", "li", "div", "h1", "h2", "h3", "h4", "h5", "h6", "tr"]);

/** Pure, browser/SSR-safe parsing. Keep the original DOM except extracted rows/headings. */
export function parseFragranceDescription(source: string) {
  const html = marked.parse(source, { async: false, breaks: true });
  const document = parseDocument(html);
  const values = new Map<string, string>();
  type Node = typeof document | (typeof document.children)[number];

  function readRow(node: Node): boolean {
    const text = getText(node).replace(/\*\*|__/g, "").trim();
    if (sectionHeading.test(text)) {
      removeElement(node);
      return true;
    }
    const matches = Array.from(text.matchAll(labelRegex));
    if (!matches.length || text.slice(0, matches[0]?.index ?? 0).replace(/[-•\s]/g, "")) return false;
    let retained = "";
    for (let index = 0; index < matches.length; index++) {
      const match = matches[index];
      if (!match) continue;
      const start = (match.index ?? 0) + match[0].length;
      let value = text.slice(start, matches[index + 1]?.index ?? text.length).trim();
      const extra = retainedLabelRegex.exec(value);
      if (extra?.index !== undefined) {
        retained = value.slice(extra.index).trim();
        value = value.slice(0, extra.index).trim();
      }
      const field = fields.find((item) => item.aliases.some((alias) => alias.toLowerCase() === match[1]?.toLowerCase()));
      if (field && value && !values.has(field.key)) values.set(field.key, value);
    }
    if (retained) {
      const escaped = retained.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const replacement = parseDocument(`<p>${escaped}</p>`).children[0];
      if (replacement) replaceElement(node, replacement);
    } else if (matches.some((match) => {
      const field = fields.find((item) => item.aliases.some((alias) => alias.toLowerCase() === match[1]?.toLowerCase()));
      return field && values.has(field.key);
    })) {
      removeElement(node);
    }
    return true;
  }

  function visit(node: Node) {
    if (!("children" in node)) return;
    const isBlock = "name" in node && blockTags.has(node.name);
    const nestedBlocks = node.children.some((child) => "name" in child && blockTags.has(child.name));
    if (isBlock && !nestedBlocks) {
      // Split break-separated rows while retaining inline formatting in unextracted fragments.
      if (node.children.some((child) => "name" in child && child.name === "br")) {
        const fragments = render(node.children).split(/<br\s*\/?\s*>/i);
        const replacement = parseDocument(`<div>${fragments.map((fragment) => `<p>${fragment}</p>`).join("")}</div>`).children[0];
        if (replacement) {
          replaceElement(node, replacement);
          visit(replacement);
          return;
        }
      }
      if (readRow(node)) return;
    }
    for (const child of [...node.children]) visit(child);
    if (isBlock && !getText(node).trim() && !/<(?:img|video|svg)\b/i.test(render(node))) removeElement(node);
  }
  visit(document);
  return { descriptionHtml: render(document), values };
}

/** Per-field precedence: populated metafield, structured application data, description. */
export function resolveFragranceInformation(
  product: Pick<Product, "description" | "descriptionHtml" | "specifications" | "fragranceNotes" | "customSections">,
  getMetafieldValue: (namespace: string, key: string) => string | undefined = () => undefined,
) {
  const parsed = parseFragranceDescription(product.descriptionHtml ?? product.description);
  const structured = new Map<string, string>();
  for (const spec of product.specifications ?? []) {
    const field = fields.find((item) => item.aliases.some((alias) => alias.toLowerCase() === spec.label.trim().toLowerCase()));
    if (field && spec.value.trim()) structured.set(field.key, spec.value.trim());
  }
  for (const section of product.customSections ?? []) {
    if (!sectionHeading.test(section.title)) continue;
    for (const [key, value] of parseFragranceDescription(section.contentHtml).values) {
      if (!structured.has(key)) structured.set(key, value);
    }
  }
  const existingNotes = product.fragranceNotes;
  if (existingNotes?.top?.trim()) structured.set("top_notes", existingNotes.top.trim());
  if (existingNotes?.heart?.trim()) structured.set("heart_notes", existingNotes.heart.trim());
  if (existingNotes?.base?.trim()) structured.set("base_notes", existingNotes.base.trim());
  function value(key: string) {
    for (const namespace of ["product_fragrance", "fragrance", "custom"]) {
      const dedicated = metafieldText(getMetafieldValue(namespace, key));
      if (dedicated) return dedicated;
    }
    return structured.get(key) || parsed.values.get(key);
  }
  const specifications = fields.slice(0, 5).flatMap((field) => {
    const resolved = value(field.key);
    return resolved ? [{ label: field.label, value: resolved }] : [];
  });
  // Preserve extra supported structured rows rather than discarding them.
  specifications.push(...(product.specifications ?? []).filter((spec) =>
    !fields.some((field) => field.aliases.some((alias) => alias.toLowerCase() === spec.label.trim().toLowerCase())),
  ));
  const retainedSections: NonNullable<Product["customSections"]> = [];
  let descriptionHtml = parsed.descriptionHtml;
  for (const section of product.customSections ?? []) {
    if (!sectionHeading.test(section.title)) {
      retainedSections.push(section);
      continue;
    }
    const remaining = parseFragranceDescription(section.contentHtml).descriptionHtml;
    if (plain(remaining)) descriptionHtml += remaining;
  }
  return {
    descriptionHtml,
    specifications,
    fragranceNotes: { top: value("top_notes"), heart: value("heart_notes"), base: value("base_notes") },
    customSections: retainedSections.length ? retainedSections : undefined,
  };
}