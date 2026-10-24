/**
 * Locks page scrolling while a full-screen overlay is open, and puts everything back exactly as it was.
 *
 * `overflow: hidden` on <body> alone is not enough on iOS Safari (touch scrolling and rubber-banding
 * still move the page behind the overlay), so the body is pinned with `position: fixed` at its current
 * offset instead. That also freezes horizontal scrolling, and closing restores the exact scroll position.
 *
 * Ref-counted: nested/overlapping callers share one lock, the previous inline styles are captured once
 * by the first caller, and only the last release restores them. Each returned release function is safe
 * to call more than once.
 */

const BODY_PROPS = ["position", "top", "left", "width", "overflow", "paddingRight", "overscrollBehavior"] as const;
const HTML_PROPS = ["overscrollBehavior", "scrollBehavior"] as const;

type Saved = {
  scrollX: number;
  scrollY: number;
  body: Record<(typeof BODY_PROPS)[number], string>;
  html: Record<(typeof HTML_PROPS)[number], string>;
};

let depth = 0;
let saved: Saved | null = null;

function acquire() {
  depth++;
  if (depth > 1) return;

  const { body, documentElement: html } = document;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  // Taking the body out of normal flow removes the vertical scrollbar on desktop, which would make the
  // page jump sideways; pad by the scrollbar's width to keep the layout where it was.
  const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

  saved = {
    scrollX,
    scrollY,
    body: Object.fromEntries(BODY_PROPS.map((p) => [p, body.style[p]])) as Saved["body"],
    html: Object.fromEntries(HTML_PROPS.map((p) => [p, html.style[p]])) as Saved["html"],
  };

  if (scrollbarWidth > 0) {
    const currentPadding = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
  }
  body.style.position = "fixed";
  body.style.top = `${-scrollY}px`;
  body.style.left = `${-scrollX}px`;
  body.style.width = "100%";
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";
  html.style.overscrollBehavior = "none";
}

function release() {
  depth = Math.max(0, depth - 1);
  if (depth > 0 || !saved) return;

  const { body, documentElement: html } = document;
  const { scrollX, scrollY, body: bodyStyles, html: htmlStyles } = saved;
  saved = null;

  for (const p of BODY_PROPS) body.style[p] = bodyStyles[p];
  // The stylesheet may set `scroll-behavior: smooth`, which would animate the jump back to the saved
  // position instead of restoring it instantly.
  html.style.scrollBehavior = "auto";
  window.scrollTo(scrollX, scrollY);
  for (const p of HTML_PROPS) html.style[p] = htmlStyles[p];
}

export function lockBodyScroll(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  acquire();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
  };
}
