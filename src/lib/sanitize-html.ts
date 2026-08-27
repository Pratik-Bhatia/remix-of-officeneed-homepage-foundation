/**
 * Minimal, dependency-free HTML sanitizer for commerce rich-text
 * (Shopify `descriptionHtml`). Keeps structural formatting — paragraphs,
 * lists, headings, bold/italic, links, line breaks — and drops everything
 * else, including all event handlers, scripts, styles and unsafe URLs.
 *
 * Runs identically on the server (SSR) and in the browser: no DOM required.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "a",
  "span",
  "div",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
  "small",
  "sup",
  "sub",
  "code",
  "pre",
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);

const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#)/i;

function sanitizeAttributes(tag: string, raw: string): string {
  if (tag !== "a") return "";
  const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(raw);
  const value = (href?.[2] ?? href?.[3] ?? href?.[4] ?? "").trim();
  if (!value || !SAFE_HREF.test(value)) return "";
  const escaped = value.replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return ` href="${escaped}" target="_blank" rel="noopener noreferrer nofollow"`;
}

export function sanitizeHtml(input?: string | null): string {
  if (!input) return "";

  // Drop script/style/iframe/object blocks entirely (including content).
  let html = input.replace(
    /<\s*(script|style|iframe|object|embed|noscript|svg|math|form|input|button)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
    "",
  );
  html = html.replace(
    /<\s*\/?\s*(script|style|iframe|object|embed|noscript|svg|math|form|input|button)\b[^>]*>/gi,
    "",
  );
  // Strip HTML comments (can hide conditional payloads).
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  return html.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_m, slash, name, attrs) => {
    const tag = String(name).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (slash) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
    const selfClosing = VOID_TAGS.has(tag);
    return `<${tag}${sanitizeAttributes(tag, String(attrs))}${selfClosing ? " />" : ""}>`;
  });
}

/** True when the rich text has any renderable content after sanitizing. */
export function hasRichText(input?: string | null): boolean {
  const clean = sanitizeHtml(input);
  return clean.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}
