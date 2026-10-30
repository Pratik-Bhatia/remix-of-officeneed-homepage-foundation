/**
 * Runs `fn` once the page has fully loaded and the main thread is idle (or
 * after `timeout` ms of waiting for idle). Used to keep non-critical work --
 * the chat assistant, third-party tag scripts -- off the critical rendering
 * path. Returns a cancel function. Browser-only.
 */
export function whenIdleAfterLoad(fn: () => void, timeout = 2000): () => void {
  // Degrade safely where the page lifecycle can't be observed (no window
  // events): run now rather than never.
  if (typeof window === "undefined" || typeof window.addEventListener !== "function" || typeof document === "undefined") {
    fn();
    return () => {};
  }
  let idleId: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (typeof window.requestIdleCallback === "function") idleId = window.requestIdleCallback(fn, { timeout });
    else timer = setTimeout(fn, Math.min(timeout, 1500));
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
    if (timer !== undefined) clearTimeout(timer);
  };
}

/**
 * Runs `fn` just after the next frame has been rendered, when layout is
 * already up to date -- so layout reads (scrollWidth, clientWidth, ...) in
 * `fn` don't force an extra synchronous layout in the middle of a render.
 * Returns a cancel function.
 */
export function afterNextPaint(fn: () => void): () => void {
  if (typeof requestAnimationFrame !== "function") {
    const timer = setTimeout(fn, 0);
    return () => clearTimeout(timer);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(fn, 0);
  });
  return () => {
    cancelAnimationFrame(frame);
    if (timer !== undefined) clearTimeout(timer);
  };
}
