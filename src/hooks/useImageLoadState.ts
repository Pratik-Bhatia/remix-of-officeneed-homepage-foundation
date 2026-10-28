import { useCallback, useState } from "react";

/**
 * Per-URL load state for a set of images (e.g. a product gallery), so a
 * placeholder shows only while THAT image hasn't loaded yet. Once a URL has
 * loaded it stays loaded: switching variants, thumbnails or hover images
 * back to it never re-shows a skeleton. A URL that fails is remembered so
 * callers can show a fallback instead of a broken image.
 */
export function useImageLoadState() {
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());

  const markLoaded = useCallback((key: string) => setLoaded((s) => (s.has(key) ? s : new Set(s).add(key))), []);
  const markFailed = useCallback((key: string) => setFailed((s) => (s.has(key) ? s : new Set(s).add(key))), []);

  /** Props for the <img>: load/error handlers, plus a ref that catches an
   * image that finished (e.g. server-rendered, or cached) before hydration,
   * whose load event React never saw. */
  const imageProps = useCallback(
    (key: string) => ({
      onLoad: () => markLoaded(key),
      onError: () => markFailed(key),
      ref: (img: HTMLImageElement | null) => {
        if (!img?.complete) return;
        if (img.naturalWidth > 0) markLoaded(key);
        else if (img.currentSrc) markFailed(key);
      },
    }),
    [markLoaded, markFailed],
  );

  return {
    isLoaded: (key: string) => loaded.has(key),
    isFailed: (key: string) => failed.has(key),
    imageProps,
  };
}
