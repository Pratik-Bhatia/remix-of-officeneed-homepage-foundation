/**
 * Client-only: analyzes a product image to find how much of its frame the
 * actual (non-background) product content occupies, then returns a scale
 * factor that would bring that content up to a consistent target fill
 * percentage. Used to visually normalize perceived product size across
 * cards whose source images have inconsistent product-to-frame ratios
 * (see ProductCard.tsx) -- without cropping or editing the source image
 * files. Purely a display-time CSS transform on the existing, unchanged
 * <img>; the file itself is never touched.
 *
 * Fails safe: any error (CORS-tainted canvas, decode failure, nothing
 * detected as content) resolves to scale 1 -- identical to today's
 * behavior -- rather than guessing.
 */
import { useEffect, useState } from "react";

// Tuned against the real Officeneed Exclusive catalogue (9 products): the
// corrected container-space fill ratio (see analyzeImage) ranges ~0.62-0.98,
// avg ~0.87. 0.80 leaves the already-consistent majority untouched (no
// unnecessary enlarging) while meaningfully correcting the one real
// outlier (a landscape image whose product only fills ~52% of its own
// frame width, so object-contain's letterboxing shrinks it further) up to
// roughly the same visual scale as the rest, without needing a large zoom.
const TARGET_FILL_RATIO = 0.8;
const MAX_SCALE = 1.5;
const ANALYSIS_SIZE = 120; // downscaled analysis canvas edge length, for performance
const BACKGROUND_TOLERANCE = 28; // per-pixel RGB distance from the sampled background to count as "content"
const ALPHA_CONTENT_THRESHOLD = 200; // for alpha-cutout images: a pixel counts as content once alpha exceeds this

const scaleCache = new Map<string, number>();

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function analyzeImage(img: HTMLImageElement): number | null {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, ANALYSIS_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const corners: Array<[number, number]> = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
    ];

    // Some of this catalogue's images are real alpha-channel cutouts (fully
    // transparent corners) rather than a flat-color background baked into
    // the pixels. A transparent pixel's RGB is meaningless (often (0,0,0)),
    // so averaging it as a "background color" and measuring distance from
    // black misclassifies almost the whole opaque canvas as content. When
    // the corners are meaningfully transparent, trust alpha directly
    // instead; otherwise fall back to the original corner-color-distance
    // method for images with a real flat background.
    let cornerAlphaSum = 0;
    for (const [x, y] of corners) cornerAlphaSum += data[(y * w + x) * 4 + 3]!;
    const useAlphaSignal = cornerAlphaSum / 4 < 32;

    let br = 0, bg = 0, bb = 0;
    if (!useAlphaSignal) {
      for (const [x, y] of corners) {
        const i = (y * w + x) * 4;
        br += data[i]!; bg += data[i + 1]!; bb += data[i + 2]!;
      }
      br /= 4; bg /= 4; bb /= 4;
    }

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = data[i + 3]!;
        let isContent: boolean;
        if (useAlphaSignal) {
          isContent = a >= ALPHA_CONTENT_THRESHOLD;
        } else {
          if (a < 16) continue; // fully transparent -- not content
          isContent = colorDistance(data[i]!, data[i + 1]!, data[i + 2]!, br, bg, bb) > BACKGROUND_TOLERANCE;
        }
        if (isContent) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) return null; // nothing detected as content

    const contentWidthRatio = (maxX - minX + 1) / w;
    const contentHeightRatio = (maxY - minY + 1) / h;

    // object-contain fits the image's own aspect ratio into a SQUARE
    // container by shrinking to the limiting dimension (a landscape image
    // is letterboxed, a portrait one pillarboxed) -- so how much of the
    // image's own canvas the product fills isn't what determines its
    // perceived size in the square card; how much of the CONTAINER it
    // fills is. Map the content box into container-space before measuring.
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    const renderedWidthInContainer = aspectRatio >= 1 ? 1 : aspectRatio;
    const renderedHeightInContainer = aspectRatio >= 1 ? 1 / aspectRatio : 1;
    const containerContentWidth = contentWidthRatio * renderedWidthInContainer;
    const containerContentHeight = contentHeightRatio * renderedHeightInContainer;
    return Math.max(containerContentWidth, containerContentHeight);
  } catch {
    return null; // CORS-tainted canvas or other failure
  }
}

/** Resolves to a cached scale factor for this image URL (1 = no change). Never rejects. */
export function getNormalizedImageScale(url: string): Promise<number> {
  const cached = scaleCache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const fillRatio = analyzeImage(img);
      const scale = fillRatio && fillRatio > 0 ? Math.min(MAX_SCALE, Math.max(1, TARGET_FILL_RATIO / fillRatio)) : 1;
      scaleCache.set(url, scale);
      resolve(scale);
    };
    img.onerror = () => {
      scaleCache.set(url, 1);
      resolve(1);
    };
    img.src = url;
  });
}

/**
 * React hook wrapping getNormalizedImageScale. Always starts at 1 (so SSR
 * and first client paint match, no hydration mismatch) and updates once
 * the async analysis resolves. `enabled` scopes this to the callers that
 * actually want normalization (e.g. only Officeneed Exclusive cards).
 */
export function useNormalizedImageScale(url: string | undefined, enabled: boolean): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!enabled || !url) {
      setScale(1);
      return;
    }
    let cancelled = false;
    getNormalizedImageScale(url).then((s) => {
      if (!cancelled) setScale(s);
    });
    return () => {
      cancelled = true;
    };
  }, [url, enabled]);

  return scale;
}
