import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize-html";

/**
 * Renders sanitized commerce rich-text (Shopify descriptionHtml) while
 * preserving paragraphs, lists, headings, bold/italic and links.
 * Falls back to plain text (with line breaks kept) when no HTML is available.
 */
export function RichText({
  html,
  text,
  className,
}: {
  html?: string | null | undefined;
  text?: string | null | undefined;
  className?: string | undefined;
}) {
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  const base = cn(
    "text-sm leading-relaxed text-muted-foreground",
    "[&_p]:mb-3 [&_p:last-child]:mb-0",
    "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
    "[&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
    "[&_li]:leading-relaxed",
    "[&_strong]:font-semibold [&_strong]:text-foreground [&_b]:font-semibold [&_b]:text-foreground",
    "[&_em]:italic",
    "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-foreground",
    "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground",
    "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground",
    "[&_h4]:mb-2 [&_h4]:mt-3 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-foreground",
    "[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-foreground",
    "[&_table]:w-full [&_table]:text-left [&_td]:py-1 [&_td]:pr-4 [&_th]:py-1 [&_th]:pr-4",
    "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3",
    "[&_hr]:my-4 [&_hr]:border-border",
    className,
  );

  const hasHtml = clean.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;

  if (hasHtml) {
    return <div className={base} dangerouslySetInnerHTML={{ __html: clean }} />;
  }

  if (!text?.trim()) return null;
  return <div className={cn(base, "whitespace-pre-line")}>{text}</div>;
}
