import { trackLead } from "@/lib/meta-pixel";
import { toast } from "sonner";
import { processLogoServer } from "@/lib/image-processing.functions";
﻿import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Check, Loader2, RotateCw, Move, Pencil, AlertCircle, FlipHorizontal2, FlipVertical2, ArrowLeft, Lock, Minus, Plus } from "lucide-react";
import { motion, useMotionValue } from "motion/react";
// html2canvas-pro (not html2canvas): the original chokes on modern CSS
// color functions (oklch/oklab/lab/lch/color-mix) -- which this app's
// Tailwind design tokens use -- and throws "Attempting to parse an
// unsupported color function" the moment it walks any element using them,
// killing the customization snapshot capture. Same API, drop-in fix.
import html2canvas from "html2canvas-pro";
import { submitCorporateQuote } from "@/lib/corporate-quotes.functions";
import { getBrandingLimits, computeEffectiveMaxScale, computeGeometricMaxScale, computeMinEffectiveScale, scaleToPhysicalMm, widthMmToScale, heightMmToScale, MIN_LOGO_SIZE_MM, GIFT_SET_REFERENCE_WIDTH_MM, CORPORATE_GIFTING_DEFAULT_REFERENCE_WIDTH_MM, type PrintingMethod, type BrandingLimits } from "@/lib/branding-limits";
import { getPrintableArea } from "@/lib/printable-area";

interface ProductCustomizerProps {
  product: any;
  selectedVariant?: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "customize" | "quote" | "success";



const processLogos = (src: string): Promise<{ uvLogo: string; laserLogo: string }> => {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve({ uvLogo: src, laserLogo: src });
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        const isNearWhite = (r: number, g: number, b: number, a: number) => {
          if (a < 10) return true; 
          return r > 200 && g > 200 && b > 200; // Lowered to 200 to catch grayish JPEG backgrounds
        };
        
        const visited = new Uint8Array(width * height);
        const queue: number[] = [];
        
        // Seed from the outer 10 pixel margin to bypass JPEG artifact borders
        const margin = Math.min(10, Math.floor(width / 2), Math.floor(height / 2));
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (x < margin || x >= width - margin || y < margin || y >= height - margin) {
              const idx = y * width + x;
              if (!visited[idx] && isNearWhite(data[idx * 4]!, data[idx * 4 + 1]!, data[idx * 4 + 2]!, data[idx * 4 + 3]!)) {
                queue.push(idx);
                visited[idx] = 1;
              }
            }
          }
        }
        
        let head = 0;
        while (head < queue.length) {
          const p = queue[head++]!;
          data[p * 4 + 3] = 0;
          
          const px = p % width;
          const py = Math.floor(p / width);
          
          const neighbors: [number, number][] = [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const np = ny * width + nx;
              if (!visited[np]) {
                const nIdx = np * 4;
                if (isNearWhite(data[nIdx]!, data[nIdx+1]!, data[nIdx+2]!, data[nIdx+3]!)) {
                  visited[np] = 1;
                  queue.push(np);
                }
              }
            }
          }
        }
        
        // At this point, the background is removed.
        ctx.putImageData(imageData, 0, 0);
        const uvLogoBase64 = canvas.toDataURL("image/png");
        
        // Now convert remaining artwork to silver
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! > 0) {
            const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            const silverBase = Math.floor(160 + (luminance / 255) * 60);
            data[i] = silverBase;
            data[i + 1] = silverBase;
            data[i + 2] = silverBase;
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
        const laserLogoBase64 = canvas.toDataURL("image/png");
        
        resolve({ uvLogo: uvLogoBase64, laserLogo: laserLogoBase64 });
      } catch (e) {
        resolve({ uvLogo: src, laserLogo: src });
      }
    };
    img.onerror = () => {
      resolve({ uvLogo: src, laserLogo: src });
    };
    img.src = src;
  });
};


// ---------------------------------------------------------------------------
// Visible-bounds measurement
// Scans the non-transparent pixels of a processed logo image to determine its
// actual visible bounding box, ignoring transparent padding from the original
// canvas.  This ensures the physical-size restriction is applied to the logo
// artwork itself rather than empty transparent space.
// ---------------------------------------------------------------------------
async function measureVisibleBounds(
  src: string,
): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
          return;
        }
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let minX = canvas.width;
        let maxX = -1;
        let minY = canvas.height;
        let maxY = -1;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            // Alpha channel at index [3]; threshold 96 ignores lightly
            // anti-aliased edge pixels that would skew bounds for logos
            // with soft edges or rounded corners.
            if ((data[(y * canvas.width + x) * 4 + 3] ?? 0) > 96) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) {
          // No visible pixels found -- fall back to natural dimensions
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
        } else {
          resolve({ w: maxX - minX + 1, h: maxY - minY + 1 });
        }
      } catch {
        resolve({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.onerror = () => resolve({ w: 100, h: 100 });
    img.src = src;
  });
}

export function ProductCustomizer({ product, selectedVariant, open, onOpenChange }: ProductCustomizerProps) {
  const [step, setStep] = useState<Step>("customize");

  // Below lg (1024px) -- the exact breakpoint the rest of this component's
  // JSX already splits on (lg:flex-1 / lg:w-[450px] / lg:sticky etc.) -- the
  // "customize" step renders as a 2-step horizontal slider instead of one
  // long stack. Lazily initialized from matchMedia rather than defaulting
  // to false-then-correcting-in-an-effect: this component only ever mounts
  // after the shopper clicks "Customize This Product" (Dialog unmounts its
  // content entirely while closed -- see ui/dialog.tsx), so there is no SSR
  // pass to keep in sync with here, and `window` is always available by the
  // time this runs.
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setIsMobileLayout(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Which of the 2 mobile-only sub-steps of "customize" is showing. Only
  // read/used by the mobile branch below -- the desktop branch ignores it
  // entirely, since desktop keeps showing everything in one view.
  const [mobileStep, setMobileStep] = useState<1 | 2>(1);
  // Fresh customization session each time the dialog opens -- never resets
  // logo/position/quantity/printing-method state, only which sub-step is
  // showing.
  useEffect(() => {
    if (open) setMobileStep(1);
  }, [open]);

  // This dialog's own Radix overlay/content sit at z-50, same as every
  // other Dialog in the app, but the floating chat launcher (ChatWidget.tsx)
  // is z-[100] with no awareness of ANY dialog -- it was rendering on top
  // of this one, uncontrolled, same gap already fixed for the mobile nav
  // drawer and the sign-in modal via their own dedicated events. A third,
  // independent event (not reusing either of those) so this dialog's state
  // can't race with theirs; ChatWidget ORs all 3 together.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("officeneed:customizer-toggle", { detail: { open } }));
  }, [open]);

  const defaultPreviewImage = selectedVariant?.image?.url || product.images?.[0] || "https://placehold.co/800x1000/f8f9fa/a1a1aa?text=Product+Image";

  const [logo, setLogo] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoScale, setLogoScale] = useState([50]);
  const [logoRotation, setLogoRotation] = useState([0]);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [uvLogo, setUvLogo] = useState<string | null>(null);
  const [laserLogo, setLaserLogo] = useState<string | null>(null);
  const [isProcessingLaser, setIsProcessingLaser] = useState(false);
  const [userSelectedPrintingMethod, setUserSelectedPrintingMethod] = useState<"Laser Engraving" | "UV Printing">("Laser Engraving");
  /**
   * Visible bounding-box dimensions (px) of the current processed logo.
   * Derived from the background-removed image so transparent padding is excluded.
   * Used to enforce the physical branding-size limit with correct aspect ratio.
   */
  const [logoNaturalDims, setLogoNaturalDims] = useState<{ w: number; h: number } | null>(null);
  /** Raw string values for the Width / Height mm inputs (allows partial typing). */
  const [sizeInputW, setSizeInputW] = useState("");
  const [sizeInputH, setSizeInputH] = useState("");

  // ---------------------------------------------------------------------------
  // Multi-component gift sets
  //
  // A product is treated as a real multi-component set ONLY when Shopify's
  // own `custom.gift_set_components` data (see shopify-overlay.ts) has 2+
  // entries -- never guessed from image count, title text, or tags. Every
  // other product (including every gift set that hasn't been given this
  // metafield yet) is completely unaffected by anything below and behaves
  // exactly as before this feature existed.
  //
  // Architecture: rather than a second, parallel customization engine, the
  // EXISTING flat state above (logo, logoScale, logoRotation, flipH/V,
  // logoPos, logoNaturalDims, uvLogo, laserLogo, ...) is reused AS-IS as the
  // live "editing buffer" for whichever single component (or the whole
  // product, for a non-multi-component item) is currently active.
  // `componentStates` is just a save slot per component, populated by
  // `selectComponent` right before it overwrites the flat state with the
  // newly-selected component's own saved values (or blank defaults). Every
  // existing handler (upload, drag, resize, rotate, flip, mm inputs,
  // captureCustomizationSnapshot, ...) is untouched and has no idea this
  // wrapper exists -- it just keeps reading/writing the same flat state it
  // always has.
  // ---------------------------------------------------------------------------
  type GiftSetComponent = {
    id: string;
    name: string;
    imageUrl: string;
    customizable: boolean;
    variantImages?: Array<{ title: string; imageUrl: string }>;
  };
  type ComponentCustomization = {
    logo: string | null;
    logoFile: File | null;
    logoBase64: string | null;
    logoDataUrl: string | null;
    uvLogo: string | null;
    laserLogo: string | null;
    logoScale: number;
    logoRotation: number;
    flipH: boolean;
    flipV: boolean;
    logoPos: { x: number; y: number };
    logoNaturalDims: { w: number; h: number } | null;
  };
  const BLANK_COMPONENT_STATE: ComponentCustomization = {
    logo: null, logoFile: null, logoBase64: null, logoDataUrl: null,
    uvLogo: null, laserLogo: null, logoScale: 50, logoRotation: 0,
    flipH: false, flipV: false, logoPos: { x: 0, y: 0 }, logoNaturalDims: null,
  };
  const giftSetComponentsList: GiftSetComponent[] = product.giftSetComponents ?? [];
  const isMultiComponentGiftSet = giftSetComponentsList.length >= 2;
  const [activeComponentIndex, setActiveComponentIndex] = useState<number | null>(
    isMultiComponentGiftSet ? 0 : null,
  );
  const [componentStates, setComponentStates] = useState<Record<string, ComponentCustomization>>({});
  const isViewingComponent = isMultiComponentGiftSet && activeComponentIndex !== null;
  const activeComponent = isViewingComponent ? giftSetComponentsList[activeComponentIndex!] ?? null : null;

  // Variant-aware component image: if this component has variant_images/
  // variant_titles data (see shopify-overlay.ts's parseGiftSetComponents),
  // look up the photo matching the CURRENTLY selected Shopify variant by
  // exact title match -- never the first/default image. A component with
  // no variant data at all, or no entry matching this specific variant
  // (e.g. that color hasn't been photographed for this item yet), falls
  // back to the component's own single base image, exactly as before this
  // existed -- never a guess, never the product's own top-level image.
  const activeComponentImageUrl = activeComponent
    ? activeComponent.variantImages?.find((v) => v.title === selectedVariant?.title)?.imageUrl
      ?? activeComponent.imageUrl
    : null;

  // The single hook point that makes the ENTIRE existing geometry/printable-
  // area/drag-boundary engine (productImageBox, containerBox, printableAreaPx,
  // activeBoundaryPx, all unchanged below) operate on the active component's
  // own real photo instead of the product's own image, with zero changes to
  // that engine itself: it all already re-measures from scratch whenever
  // this value changes (see the `previewImage` useEffect further down).
  const previewImage = activeComponentImageUrl || defaultPreviewImage;

  /** Snapshot of the live flat editing buffer, for saving into componentStates. */
  const currentFlatComponentState = (): ComponentCustomization => ({
    logo, logoFile, logoBase64, logoDataUrl, uvLogo, laserLogo,
    logoScale: logoScale[0] ?? 50, logoRotation: logoRotation[0] ?? 0,
    flipH, flipV,
    // Read the motion values directly rather than trusting `logoPos` state:
    // a component switch can happen while a boundary-clamped drag's elastic
    // snap-back is still animating (onDragTransitionEnd hasn't fired yet),
    // and the motion values are always Framer's current live truth.
    logoPos: { x: logoMotionX.get(), y: logoMotionY.get() },
    logoNaturalDims,
  });

  /** Applies a saved (or blank) component state to the live flat editing buffer. */
  const applyComponentStateToFlatBuffer = (state: ComponentCustomization) => {
    setLogo(state.logo);
    setLogoFile(state.logoFile);
    setLogoBase64(state.logoBase64);
    setLogoDataUrl(state.logoDataUrl);
    setUvLogo(state.uvLogo);
    setLaserLogo(state.laserLogo);
    setLogoScale([state.logoScale]);
    setLogoRotation([state.logoRotation]);
    setFlipH(state.flipH);
    setFlipV(state.flipV);
    setLogoPos(state.logoPos);
    logoMotionX.set(state.logoPos.x);
    logoMotionY.set(state.logoPos.y);
    setLogoNaturalDims(state.logoNaturalDims);
    setIsSelected(false);
  };

  /**
   * Switches which component the flat editing buffer represents: saves the
   * currently-active component's live state, then loads the target
   * component's own saved (or blank) state into that same buffer. Refused
   * while a just-uploaded logo is still being processed (isProcessingLaser)
   * -- the async processing callback writes into the flat buffer by
   * closure, not by component id, so switching mid-flight would silently
   * attach the result to the WRONG component once it resolves.
   */
  const selectComponent = (newIndex: number) => {
    if (newIndex === activeComponentIndex) return;
    if (logo && isProcessingLaser) {
      toast.info("Please wait a moment for your logo to finish processing.");
      return;
    }
    const currentId = activeComponentIndex !== null ? giftSetComponentsList[activeComponentIndex]?.id : undefined;
    const savedStates = currentId ? { ...componentStates, [currentId]: currentFlatComponentState() } : componentStates;
    if (currentId) setComponentStates(savedStates);

    const target = giftSetComponentsList[newIndex];
    if (!target) return;
    const restored = savedStates[target.id] ?? BLANK_COMPONENT_STATE;
    applyComponentStateToFlatBuffer(restored);
    setActiveComponentIndex(newIndex);
  };

  /** For the currently-active component this reads the LIVE flat buffer
   * (componentStates isn't updated until the user switches away); for any
   * other component it reads its last-saved state. */
  const isComponentCustomized = (index: number): boolean => {
    const comp = giftSetComponentsList[index];
    if (!comp) return false;
    if (index === activeComponentIndex) return Boolean(logo);
    return Boolean(componentStates[comp.id]?.logo);
  };

  /** The saved (or live, for the active one) state for a given component index -- used by the review list and by the quote-submission loop. */
  const getComponentState = (index: number): ComponentCustomization => {
    const comp = giftSetComponentsList[index];
    if (index === activeComponentIndex) return currentFlatComponentState();
    return (comp && componentStates[comp.id]) ?? BLANK_COMPONENT_STATE;
  };

  /** Mirrors getDisplayMmFromScale's math for an arbitrary (not necessarily active) component's saved state -- each component has its own logo aspect ratio, so this can't just read the live logoAspect/mmConversionLimits below. */
  const getComponentDisplayMm = (state: ComponentCustomization): { wMm: number; hMm: number } | null => {
    if (!state.logo || !state.logoNaturalDims) return null;
    const aspect = state.logoNaturalDims.w / state.logoNaturalDims.h;
    const logicalWmm = (state.logoScale / 100) * genericReferenceWidthMm;
    const logicalHmm = logicalWmm / aspect;
    return state.logoRotation === 90 ? { wMm: logicalHmm, hMm: logicalWmm } : { wMm: logicalWmm, hMm: logicalHmm };
  };

  /**
   * There is no longer a separate "apply to all" choice: uploading a logo
   * IS the single global action, and it always reaches every customizable
   * component automatically. Called once from handleLogoUpload right after
   * processing finishes, with the actual values passed explicitly (not read
   * back from state, which wouldn't have flushed yet inside that async
   * callback). Only writes OTHER components -- the active one's result is
   * already in the live flat buffer via the normal setLogo/setUvLogo/etc.
   * calls in handleLogoUpload, and gets saved into componentStates the
   * normal way (selectComponent) the next time the user switches away.
   *
   * Each component gets its OWN independent copy of the placement fields
   * (centered, default scale, no rotation/flip) -- not a shared reference --
   * so a later per-component adjustment (drag, resize, rotate, flip) can
   * never affect any other component. That isolation is the existing
   * save/restore engine in selectComponent, completely unchanged; this
   * function only seeds the initial values each component starts from.
   */
  const propagateLogoToOtherComponents = (fresh: {
    logo: string;
    logoFile: File;
    logoBase64: string;
    logoDataUrl: string;
    uvLogo: string | null;
    laserLogo: string | null;
    logoNaturalDims: { w: number; h: number } | null;
  }) => {
    if (!isMultiComponentGiftSet) return;
    const activeId = activeComponentIndex !== null ? giftSetComponentsList[activeComponentIndex]?.id : undefined;
    setComponentStates((prev) => {
      const next = { ...prev };
      for (const comp of giftSetComponentsList) {
        if (!comp.customizable || comp.id === activeId) continue;
        next[comp.id] = {
          ...fresh,
          logoScale: 50,
          logoRotation: 0,
          flipH: false,
          flipV: false,
          logoPos: { x: 0, y: 0 },
        };
      }
      return next;
    });
  };

  const constraintsRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const productImageRef = useRef<HTMLImageElement>(null);
  // Mobile 2-step slider only: focus moves to the newly-active pane on
  // every step change, so keyboard users land somewhere sensible instead
  // of on a now off-screen, inert element.
  const mobilePane1Ref = useRef<HTMLDivElement>(null);
  const mobilePane2Ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isMobileLayout) return;
    const target = mobileStep === 1 ? mobilePane1Ref.current : mobilePane2Ref.current;
    target?.focus();
  }, [mobileStep, isMobileLayout]);
  const [isSelected, setIsSelected] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [logoPos, setLogoPos] = useState({ x: 0, y: 0 });
  // Framer Motion's own live transform for the draggable logo. `logoPos`
  // (plain state, above) remains the single source of truth for save/
  // restore/serialization (componentStates, PDF capture, the mini-preview
  // indicator) -- unchanged. These motion values exist ONLY so the drag
  // gesture's on-screen position (including dragConstraints clamping/
  // elastic snap-back, which Framer applies live and asynchronously) can be
  // read back exactly as rendered, instead of reconstructed by hand from
  // PanInfo math (which doesn't account for constraint clamping and was the
  // root cause of logo position drift when switching gift-set components).
  const logoMotionX = useMotionValue(0);
  const logoMotionY = useMotionValue(0);

  // ---------------------------------------------------------------------------
  // Product image bounds -> printable area
  //
  // The <img> below is rendered with `object-contain` inside a box that is
  // usually a DIFFERENT aspect ratio than the photo itself, so the visible
  // product photo is letterboxed inside that box -- its actual on-screen
  // rect is smaller than (and offset within) the element's own DOM box.
  // `productImageBox` is that real, measured, letterboxed rect (in px,
  // relative to `previewContainerRef`, which is the positioned ancestor
  // shared by the dotted printable-area box and the draggable logo). Every
  // product/variant image, at every size, gets its own freshly-measured box
  // here -- nothing about it is hardcoded per product.
  const [productImageBox, setProductImageBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  // The raw box object-contain fits the photo within (== previewContainerRef's
  // own content-box size, since the <img> sits at inset-0 w-full h-full
  // matching it exactly). Unlike productImageBox, this is NOT letterbox-
  // trimmed -- it's the full coordinate space the draggable logo's own
  // absolute positioning resolves against, needed for Drinkware's clip
  // boundary (see logoClipPath below) to express its clip-path relative to
  // that same space without disturbing it.
  const [containerBox, setContainerBox] = useState({ width: 0, height: 0 });
  const naturalSizeRef = useRef<{ w: number; h: number } | null>(null);

  const recomputeProductImageBox = useCallback(() => {
    const img = productImageRef.current;
    const natural = naturalSizeRef.current;
    if (!img || !natural || !natural.w || !natural.h) return;
    // clientWidth/clientHeight are the element's own content-box size (the
    // box object-contain fits the photo within) -- independent of the
    // photo's own natural dimensions.
    const boxW = img.clientWidth;
    const boxH = img.clientHeight;
    if (!boxW || !boxH) return;
    setContainerBox({ width: boxW, height: boxH });
    const naturalRatio = natural.w / natural.h;
    const boxRatio = boxW / boxH;
    let renderW: number;
    let renderH: number;
    if (boxRatio > naturalRatio) {
      // Box is relatively wider than the photo -- height is the binding
      // dimension, empty space (if any) falls on the left/right.
      renderH = boxH;
      renderW = boxH * naturalRatio;
    } else {
      renderW = boxW;
      renderH = boxW / naturalRatio;
    }
    // img sits at inset-0 within previewContainerRef, so the img's own
    // content-box origin IS previewContainerRef's origin -- offsetLeft/Top
    // here are purely the letterbox gap introduced by object-contain.
    setProductImageBox({
      left: (boxW - renderW) / 2,
      top: (boxH - renderH) / 2,
      width: renderW,
      height: renderH,
    });
  }, []);

  const handleProductImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    naturalSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
    recomputeProductImageBox();
  }, [recomputeProductImageBox]);

  // Re-measure whenever the panel itself resizes (window resize, modal
  // resize, responsive breakpoint changes, sidebar collapsing, etc.) --
  // not just on window "resize", which wouldn't catch a layout-only change.
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => recomputeProductImageBox());
    observer.observe(container);
    return () => observer.disconnect();
  }, [recomputeProductImageBox]);

  // A different product/variant image is a NEW photo with its own natural
  // dimensions -- the previous measurement is no longer valid for it, so
  // drop it immediately rather than showing a stale printable area for one
  // frame. <img onLoad> (fired for the new src) then supplies the real one.
  useEffect(() => {
    naturalSizeRef.current = null;
    setProductImageBox({ left: 0, top: 0, width: 0, height: 0 });
  }, [previewImage]);

  // Gift sets / hampers are a multi-item photo with no single coherent
  // "printable surface" a rectangle can honestly represent -- rather than
  // keep hand-fitting per-product rectangles to whichever item happens to
  // be photographed, gift sets skip the printable-area system entirely and
  // just constrain the logo to the rendered product image itself. Never
  // detected from the image's dimensions -- from the product's own real
  // Shopify data instead.
  //
  // NOT just `product.subcategories`: every gift-set product in the store
  // IS tagged "gift sets" in Shopify (verified directly against live data),
  // but shopify-overlay.ts's classify() only honours that tag when NO
  // product-type regex matches first -- a set titled e.g. "...Diary,
  // Bottle & Pen Gift Set" hits the "Drinkware & Utensils" title-keyword
  // rule before it ever reaches the tag check, so `subcategories` alone
  // silently misses real gift sets whose title also happens to mention a
  // single-item keyword. Checking the raw tags (and the title itself, both
  // of which are reliably "gift set(s)" on every gift-set product actually
  // in this catalogue) catches those that the derived subcategory field
  // does not; subcategories is still checked too for any product that
  // falls through classify() to its own "Gift Sets" default. This is a
  // detection-side workaround for that classify() gap, not a fix to it --
  // classify() itself is shared by category pages/filters/breadcrumbs
  // sitewide and is out of scope here.
  const GIFT_SET_PATTERN = /gift\s*sets?|hamper|bundle/i;
  const isGiftSet =
    (product.tags ?? []).some((t: string) => GIFT_SET_PATTERN.test(t)) ||
    (product.subcategories ?? []).some((s: string) => GIFT_SET_PATTERN.test(s)) ||
    GIFT_SET_PATTERN.test(product.name ?? "");

  // `isGiftSet`'s "constrain to the whole rendered photo" treatment exists
  // specifically because a multi-item composite photo has no single
  // coherent printable surface. That reasoning stops applying the moment
  // `previewImage` is actually a single real component's own clean photo
  // (isViewingComponent) -- at that point it should be treated exactly
  // like any other single-item Corporate Gifting product (the fraction-
  // based default printable area, generic single-item reference width),
  // not like the composite-image fallback. Used only where the GEOMETRY
  // needs this distinction (activeBoundaryPx, genericReferenceWidthMm);
  // `isGiftSet` itself is untouched everywhere else (e.g. hideVisibleBoundary,
  // which already evaluates the same way in both cases).
  const effectiveIsGiftSet = isGiftSet && !isViewingComponent;

  // Drinkware's branding area is a FIXED PHYSICAL size (70x140mm), not a
  // fraction of the photo -- checked (and given priority) only when the
  // product is NOT a gift set, since the same classify() gap that misfiles
  // gift sets under a single-item subcategory can also make a "Diary,
  // Bottle & Pen Gift Set" match "drinkware" here; isGiftSet already
  // catches those correctly via tags, so it must win first. Checks both
  // subcategories and raw tags for the same reliability reasons as isGiftSet.
  const isDrinkware =
    !isGiftSet &&
    ((product.subcategories ?? []).some((s: string) => s.toLowerCase().includes("drinkware")) ||
      (product.tags ?? []).some((t: string) => t.toLowerCase().includes("drinkware")));

  // Same field the PDP's "Customize This Product" CTA and every mm-based
  // lookup below (getBrandingLimits/getPrintableArea) already key off --
  // real Shopify collection membership (see shopify-overlay.ts), not
  // keyword guessing -- so this is the reliable, already-established
  // signal for "is this a Corporate Gifting product", not a new check.
  const isCorporateGifting = product.category === "Corporate Gifting";

  // The dotted printable-area boundary is only meaningful for Drinkware,
  // whose 70x140mm engraving area is a real physical constraint the
  // customer needs to see. Every OTHER Corporate Gifting product (Bags,
  // Diaries, Pens, Keychains, etc.) has no such fixed-size printable
  // surface -- same reasoning Gift Sets already use -- so the boundary is
  // hidden for them exactly like it already is for Gift Sets. The
  // underlying `constraintsRef` div (position/size, drag constraint) is
  // untouched either way; only its border classes change below, so the
  // logo still can't be dragged off the product on any of these products.
  const hideVisibleBoundary = isGiftSet || (isCorporateGifting && !isDrinkware);

  const printableArea = getPrintableArea(product.category, product.subcategories?.[0] ?? "", product.slug);

  // The actual on-screen printable-area rect. Two unit systems:
  //  - "fraction": the product image's measured box, scaled by this
  //    product's own normalized (0-1) printable-area fractions.
  //  - "mm": a FIXED physical size converted to pixels via the image's live
  //    measured width/height and the area's own referenceWidthMm/
  //    referenceHeightMm anchors -- calibrated INDEPENDENTLY per axis (see
  //    MmPrintableArea's own comment for why: a photo's visible body isn't
  //    guaranteed to share the printable area's own mm aspect ratio, so one
  //    shared scale can't get both dimensions right when it doesn't). Still
  //    a single computed rect below, feeding both the dotted outline and
  //    the drag constraint -- only the calibration is per-axis, not the box.
  const printableAreaPx =
    printableArea.unit === "mm"
      ? (() => {
          const pxPerMmW = productImageBox.width / printableArea.referenceWidthMm;
          const pxPerMmH = productImageBox.height / printableArea.referenceHeightMm;
          const width = printableArea.widthMm * pxPerMmW;
          const height = printableArea.heightMm * pxPerMmH;
          const centerLeft = productImageBox.left + printableArea.centerX * productImageBox.width;
          const centerTop = productImageBox.top + printableArea.centerY * productImageBox.height;
          return { left: centerLeft - width / 2, top: centerTop - height / 2, width, height };
        })()
      : {
          left: productImageBox.left + printableArea.x * productImageBox.width,
          top: productImageBox.top + printableArea.y * productImageBox.height,
          width: printableArea.width * productImageBox.width,
          height: printableArea.height * productImageBox.height,
        };

  // Single source of truth for the dotted outline's CSS position AND the
  // max-scale clamp (computeGeometricMaxScale below): the product-specific
  // printable area for an individual product, or the full measured image
  // bounds for a gift set -- never a mix of the two, and never
  // independently computed.
  const activeBoundaryPx = effectiveIsGiftSet ? productImageBox : printableAreaPx;

  // The drag boundary (constraintsRef measures its own rendered rect, which
  // this directly controls) is DELIBERATELY NOT always activeBoundaryPx:
  // for a gift set, activeBoundaryPx (productImageBox) is re-measured from
  // scratch for every component's own photo, and genuinely differs in size
  // between components with different aspect ratios -- so constraintsRef
  // genuinely resizes every single switch. Framer Motion's ref-based
  // dragConstraints watches that element for resizes and, on every one,
  // repositions the draggable to preserve its relative "progress" within
  // the (now different-sized) bounds -- correct behavior for an actual
  // window resize, but switching components isn't a resize, it's a
  // discrete jump to a different component's own independent position.
  // Confirmed via a 7-cycle Diary<->Pen stress test: with activeBoundaryPx
  // driving the constraint box, the restored position crept by a few px
  // EVERY switch, unbounded. containerBox (the <img>'s own rendered box,
  // before object-contain's per-photo letterboxing is trimmed out of it)
  // only changes size on an actual panel/window resize -- never when
  // switching which gift-set component is active -- so using it for the
  // constraint box on gift sets specifically sidesteps Framer's resize
  // machinery entirely for the resize events that shouldn't trigger it,
  // while a real window resize still constrains/repositions exactly as
  // intended. Non-gift-set products (Drinkware's real printable area, etc.)
  // are completely unaffected: dragBoundaryPx === activeBoundaryPx for them,
  // unchanged.
  //
  // Deliberately `isGiftSet`, not `effectiveIsGiftSet`: the latter is
  // false while viewing an individual component (isViewingComponent), which
  // is exactly when activeBoundaryPx falls back to printableAreaPx --
  // itself still derived from productImageBox for these generic (non-
  // Drinkware) Corporate Gifting products, so it resizes on every switch
  // too. The drag-boundary fix needs to apply for the whole gift-set
  // experience, component view included -- that's the entire scenario it's
  // fixing.
  const dragBoundaryPx = isGiftSet
    ? { left: 0, top: 0, width: containerBox.width, height: containerBox.height }
    : activeBoundaryPx;

  // Drinkware only: a CSS clip-path (expressed in the SAME coordinate space
  // the logo's own absolute positioning already uses -- previewContainerRef,
  // i.e. containerBox -- so this clips the visual result without moving or
  // resizing anything or altering that coordinate space) that hard-cuts any
  // part of the logo extending past the 70x140mm boundary, regardless of
  // whether the overflow came from dragging (already prevented by
  // dragConstraints), resizing, or rotating (neither of which has its own
  // boundary check) -- so "never visible outside the area" holds for every
  // interaction, not just drag.
  const logoClipPath =
    isDrinkware && containerBox.width && containerBox.height
      ? `inset(${activeBoundaryPx.top}px ${containerBox.width - activeBoundaryPx.left - activeBoundaryPx.width}px ${containerBox.height - activeBoundaryPx.top - activeBoundaryPx.height}px ${activeBoundaryPx.left}px)`
      : undefined;

  const [formData, setFormData] = useState({
    fullName: "",
    company: "",
    email: "",
    phone: "",
    quantity: "1",
    deliveryDate: "",
    location: "",
    requirements: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refNumber, setRefNumber] = useState("");
  /**
   * The customization snapshot (product image + logo, exactly as
   * positioned/sized/rotated/flipped) captured at the moment the user
   * leaves the "customize" step. Captured HERE -- not inside submitQuote --
   * because previewContainerRef only exists while `step === "customize"`
   * is rendered; by the time the user reaches the "quote" step's own submit
   * button, that DOM has already unmounted and the ref is null. Storing the
   * result in state is what lets it survive the step change.
   */
  const [customizationSnapshot, setCustomizationSnapshot] = useState("");
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);
  /**
   * Multi-component gift sets only. Same reasoning as customizationSnapshot
   * above (previewContainerRef/the component selector UI don't exist once
   * `step` leaves "customize"): captured per customized component in
   * handleProceedToQuote, read back by submitQuote once the user is on the
   * quote-details form.
   */
  const [componentPreviews, setComponentPreviews] = useState<Record<string, string>>({});
  const [finalComponentStates, setFinalComponentStates] = useState<Record<string, ComponentCustomization>>({});

  const quantityNum = parseInt(formData.quantity, 10) || 1;
  const isUvAvailable = quantityNum >= 25;
  const printingMethod = isUvAvailable ? userSelectedPrintingMethod : "Laser Engraving";
  const currentDisplayLogo = printingMethod === "Laser Engraving" ? laserLogo : uvLogo;
  const laserDropShadow = "drop-shadow(0px -1px 0px rgba(0,0,0,0.3)) drop-shadow(0px 1px 1px rgba(255,255,255,0.2))";
  
  const activeMixBlend = "normal";

  // ---------------------------------------------------------------------------
  // Physical branding-size constraint (Laser 30 mm / UV 25 mm for drinkware)
  // ---------------------------------------------------------------------------
  const brandingLimits = getBrandingLimits(
    product.category,
    product.subcategories?.[0] ?? "",
    printingMethod as PrintingMethod,
  );

  // Aspect ratio of the logo's VISIBLE bounding box (width / height).
  // Falls back to 1 (square) until the logo is loaded and measured.
  const logoAspect = logoNaturalDims ? logoNaturalDims.w / logoNaturalDims.h : 1;

  // Every Corporate Gifting product other than Drinkware (Gift Sets and
  // everything else) has no `brandingLimits` entry, so gets its mm<->scale%
  // conversion anchored to a generic per-case estimate instead -- see the
  // constants' own comments in branding-limits.ts for what these numbers
  // do and don't affect (display only, never the actual enforced size).
  const genericReferenceWidthMm = effectiveIsGiftSet ? GIFT_SET_REFERENCE_WIDTH_MM : CORPORATE_GIFTING_DEFAULT_REFERENCE_WIDTH_MM;

  /**
   * A synthetic `BrandingLimits`-shaped object that lets the Width/Height mm
   * input machinery below (`applyScaleWithLimits`, `getDisplayMmFromScale`,
   * `handleWidthChange`/`handleHeightChange`) work identically for Drinkware
   * AND every other Corporate Gifting product, without duplicating that
   * logic: Drinkware uses its real `brandingLimits`; any other Corporate
   * Gifting product gets this generic-reference stand-in (its `maxLogoSizeMm`
   * is never read by the mm<->scale% math itself -- only `previewAreaWidthMm`
   * is -- the actual maximum is `effectiveMaxScale`/`computeGeometricMaxScale`
   * below, not this field); non-Corporate-Gifting products get `null`, same
   * as before, so the mm control stays hidden and existing behaviour for
   * every other category is untouched.
   */
  const mmConversionLimits: BrandingLimits | null =
    brandingLimits ??
    (isCorporateGifting ? { maxLogoSizeMm: Infinity, previewAreaWidthMm: genericReferenceWidthMm } : null);

  /**
   * The hard upper bound for `logoScale` (0-100).
   *  - Drinkware: unchanged -- the physical Laser/UV mm production cap.
   *  - Any other Corporate Gifting product (incl. Gift Sets): computed
   *    dynamically from the product's OWN actual customization-area
   *    rectangle (`activeBoundaryPx`) against the live-measured preview
   *    panel (`containerBox`) -- never a fixed mm figure, so the logo can
   *    never be resized beyond what genuinely fits that product's area.
   *  - Everything else: unchanged, unconstrained (100).
   */
  const effectiveMaxScale = brandingLimits
    ? computeEffectiveMaxScale(brandingLimits, logoAspect)
    : isCorporateGifting
      ? computeGeometricMaxScale(activeBoundaryPx.width, activeBoundaryPx.height, containerBox.width, logoAspect)
      : 100;

  /**
   * Lower bound for `logoScale`: the longest dimension must be >= 1 mm
   * (`MIN_LOGO_SIZE_MM`) for Drinkware or any other Corporate Gifting
   * product (Gift Set or not) -- using the SAME mm<->scale% conversion
   * machinery, just with each case's own reference width. Anything else
   * unconfigured falls back to the legacy 15% floor so the logo cannot be
   * shrunk to invisibility by accident.
   */
  const minEffectiveScale = brandingLimits
    ? computeMinEffectiveScale(brandingLimits, logoAspect)
    : isCorporateGifting
      ? computeMinEffectiveScale(
          { maxLogoSizeMm: Infinity, previewAreaWidthMm: genericReferenceWidthMm },
          logoAspect,
          MIN_LOGO_SIZE_MM,
        )
      : 15;

  /**
   * The "max __ mm" hint shown next to the Width/Height inputs: Drinkware's
   * own real `maxLogoSizeMm`, or -- for every other Corporate Gifting
   * product -- the longest dimension (mm) that `effectiveMaxScale` (the
   * actual geometric clamp, not an estimate) works out to at this logo's
   * aspect ratio, so the number shown always matches what's really enforced.
   */
  const displayMaxLongestMm = brandingLimits
    ? brandingLimits.maxLogoSizeMm
    : mmConversionLimits
      ? (() => {
          const { widthMm, heightMm } = scaleToPhysicalMm(effectiveMaxScale, mmConversionLimits, logoAspect);
          return Math.max(widthMm, heightMm);
        })()
      : 0;

  const initialPinchRef = useRef<{ dist: number; angle: number; initialScale: number; initialRot: number } | null>(null);
  /** Prevents the pinch-zoom max-size warning from firing on every touch frame. */
  const pinchWarnedRef = useRef(false);
  /**
   * Tracks which mm input the user is currently typing in so the sync
   * useEffect doesn't overwrite the field mid-keystroke.
   * Set to null whenever neither field has focus.
   */
  const editingFieldRef = useRef<"W" | "H" | null>(null);

  useEffect(() => {
    if (open) {
      setStep("customize");
      setLogo(null);
      setLogoFile(null);
      setLogoBase64(null);
      setLogoDataUrl(null);
      setLogoScale([50]);
      setLogoRotation([0]);
      setFlipH(false);
      setFlipV(false);
      setIsSelected(false);
      setErrorMsg(null);
      setLogoNaturalDims(null);
      setFormData(prev => ({ ...prev, quantity: "1" }));
    }
  }, [open, product]);

  /**
   * When the user switches between Laser and UV (or quantity crosses the 25-unit
   * threshold that unlocks UV), clamp the current logoScale to the new physical
   * maximum.  The logo is NEVER automatically enlarged when switching back to a
   * method with a larger limit -- the user must manually resize up (but still
   * can't exceed the new maximum).
   */
  useEffect(() => {
    if (!logo || !logoNaturalDims) return;
    setLogoScale(prev => [Math.min(prev[0] ?? effectiveMaxScale, effectiveMaxScale)]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printingMethod]);

  /**
   * Keep the mm dimension inputs in sync with `logoScale` whenever it changes
   * (drag, pinch, upload auto-size, method switch, rotation, etc.).
   *
   * Single source of truth:
   *   logicalWidthMm  = (scale / 100) * previewAreaWidthMm
   *   logicalHeightMm = logicalWidthMm / logoAspect
   *
   * At 90° rotation the visual width is the logical height and vice-versa,
   * so the fields are swapped before display.
   *
   * The field the user is CURRENTLY TYPING IN is skipped so that mid-keystroke
   * values are not clobbered by the effect.
   */
  useEffect(() => {
    if (!mmConversionLimits || !logoNaturalDims) {
      if (editingFieldRef.current === null) {
        setSizeInputW("");
        setSizeInputH("");
      }
      return;
    }
    const { wMm, hMm } = getDisplayMmFromScale(logoScale[0] ?? 0);
    if (editingFieldRef.current !== "W") {
      setSizeInputW(parseFloat(wMm.toFixed(1)).toString());
    }
    if (editingFieldRef.current !== "H") {
      setSizeInputH(parseFloat(hMm.toFixed(1)).toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoScale[0], logoNaturalDims, printingMethod, logoRotation[0]]);

  // ---------------------------------------------------------------------------
  // Logo Size mm input handlers
  // ---------------------------------------------------------------------------

  /**
   * The max-size warning shown wherever `effectiveMaxScale` is hit (typed mm
   * input, pinch, drag-resize-handle): Drinkware states its real physical
   * production cap; every other Corporate Gifting product has no such fixed
   * mm figure (its max is geometric, see `computeGeometricMaxScale`), so it
   * gets a message describing WHY instead of a specific -- and not entirely
   * meaningful for a two-axis rectangular constraint -- mm number.
   */
  const maxSizeToastMessage = (): string =>
    brandingLimits
      ? `Maximum logo size is ${brandingLimits.maxLogoSizeMm} mm for ${printingMethod}.`
      : "Maximum size for this product's customization area reached.";

  /**
   * Core: apply a desired logoScale value while enforcing min/max physical
   * limits and showing user-friendly messages.
   *
   * Returns the CLAMPED scale that was actually applied.  Callers must derive
   * any displayed mm values from this return value -- NEVER from the raw,
   * potentially out-of-range, requested scale -- so an invalid entry (e.g.
   * "31" when the max is 30) can never remain visible in the UI.
   */
  const applyScaleWithLimits = (rawScale: number): number => {
    if (!mmConversionLimits) return rawScale;
    let clamped = rawScale;
    if (!isFinite(rawScale)) {
      clamped = minEffectiveScale;
    } else if (rawScale > effectiveMaxScale) {
      clamped = effectiveMaxScale;
      toast.info(maxSizeToastMessage());
    } else if (rawScale < minEffectiveScale) {
      clamped = minEffectiveScale;
      toast.info(`Minimum logo size is ${MIN_LOGO_SIZE_MM} mm.`);
    }
    setLogoScale([clamped]);
    return clamped;
  };

  /**
   * Single source of truth for the mm values shown in the Width/Height
   * inputs: both are always derived from `logoScale` (the one canonical
   * transform, also used by drag/pinch/resize) plus the logo's original
   * aspect ratio, which keeps the two fields permanently locked together and
   * in sync with the actual preview/print size. Accounts for the 90°
   * rotation swap (visual width <-> logical height).
   */
  const getDisplayMmFromScale = (scale: number): { wMm: number; hMm: number } => {
    if (!mmConversionLimits) return { wMm: 0, hMm: 0 };
    const logicalWmm = (scale / 100) * mmConversionLimits.previewAreaWidthMm;
    const logicalHmm = logicalWmm / logoAspect;
    const isSwapped = (logoRotation[0] ?? 0) === 90;
    return isSwapped
      ? { wMm: logicalHmm, hMm: logicalWmm }
      : { wMm: logicalWmm, hMm: logicalHmm };
  };

  /**
   * Width input change.
   * Marks this field as active (editingFieldRef = "W") so the sync effect does
   * not clobber it mid-keystroke. The requested value is converted to a scale,
   * hard-clamped by `applyScaleWithLimits`, and BOTH mm fields are then
   * immediately re-derived from that clamped scale (via getDisplayMmFromScale)
   * -- so a value that exceeds the physical maximum (or drops below the 1mm
   * floor) is corrected on the spot, never left on screen, and Height stays
   * locked to the logo's original aspect ratio (never clamped independently).
   * Accounts for 90° rotation: the visual "Width" field maps to the logo's
   * logical height when the logo is rotated 90°.
   */
  const handleWidthChange = (val: string) => {
    editingFieldRef.current = "W";
    setSizeInputW(val);
    const enteredMm = parseFloat(val);
    if (!isFinite(enteredMm) || enteredMm <= 0 || !mmConversionLimits || !logoNaturalDims) return;

    const isSwapped = (logoRotation[0] ?? 0) === 90;
    const requestedScale = isSwapped
      ? heightMmToScale(enteredMm, mmConversionLimits, logoAspect)
      : widthMmToScale(enteredMm, mmConversionLimits);
    const clampedScale = applyScaleWithLimits(requestedScale);
    const { wMm, hMm } = getDisplayMmFromScale(clampedScale);
    setSizeInputW(parseFloat(wMm.toFixed(1)).toString());
    setSizeInputH(parseFloat(hMm.toFixed(1)).toString());
  };

  /**
   * Height input change — mirror of handleWidthChange.
   * Visual "Height" maps to logical width at 90° rotation.
   */
  const handleHeightChange = (val: string) => {
    editingFieldRef.current = "H";
    setSizeInputH(val);
    const enteredMm = parseFloat(val);
    if (!isFinite(enteredMm) || enteredMm <= 0 || !mmConversionLimits || !logoNaturalDims) return;

    const isSwapped = (logoRotation[0] ?? 0) === 90;
    const requestedScale = isSwapped
      ? widthMmToScale(enteredMm, mmConversionLimits)
      : heightMmToScale(enteredMm, mmConversionLimits, logoAspect);
    const clampedScale = applyScaleWithLimits(requestedScale);
    const { wMm, hMm } = getDisplayMmFromScale(clampedScale);
    setSizeInputW(parseFloat(wMm.toFixed(1)).toString());
    setSizeInputH(parseFloat(hMm.toFixed(1)).toString());
  };

  /**
   * Called on input blur or Enter.  Clears the active-field guard and
   * re-syncs both fields to the canonical scale-derived values (including
   * rotation awareness and correct rounding).
   */
  const syncInputsFromScale = () => {
    editingFieldRef.current = null;
    if (!mmConversionLimits || !logoNaturalDims) return;
    const { wMm, hMm } = getDisplayMmFromScale(logoScale[0] ?? 0);
    setSizeInputW(parseFloat(wMm.toFixed(1)).toString());
    setSizeInputH(parseFloat(hMm.toFixed(1)).toString());
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload a valid image file (PNG, JPG, SVG).");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File is too large (max 5MB).");
        return;
      }
      
      setLogoFile(file);
      const url = URL.createObjectURL(file);
      setLogo(url);
      setIsSelected(true);
      setLogoPos({ x: 0, y: 0 });
      logoMotionX.set(0);
      logoMotionY.set(0);
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const result = reader.result as string;
        setLogoDataUrl(result);
        const base64 = result.split(",")[1] ?? "";
        setLogoBase64(base64);
        
        setIsProcessingLaser(true);
        try {
          const res = await processLogoServer({ data: { imageBase64: base64 } });
          if (!res.success) {
            console.error("API returned error:", res.error);
            toast.error("API Error: " + res.error);
            setUvLogo(null);
            setLaserLogo(null);
          } else {
            setUvLogo(res.uvLogoUrl);
            setLaserLogo(res.laserLogoUrl);
            toast.success("Logo processing complete!");

            // -------------------------------------------------------------------
            // Auto-size the logo to fit within the physical branding maximum.
            //
            // We measure the VISIBLE bounding box (non-transparent pixels) of the
            // background-removed UV logo so that transparent padding in the
            // original file does not skew the size calculation.
            //
            // Aspect ratio is preserved: the longest dimension (width OR height)
            // is constrained to `maxLogoSizeMm`.  If no branding limits are
            // configured for this product, the scale is left at the default.
            // -------------------------------------------------------------------
            let bounds: { w: number; h: number } | null = null;
            try {
              bounds = await measureVisibleBounds(res.uvLogoUrl);
              setLogoNaturalDims(bounds);

              // Re-derive limits now that we have dimensions (printingMethod
              // captured from closure at upload time -- correct initial method).
              const currentLimits = getBrandingLimits(
                product.category,
                product.subcategories?.[0] ?? "",
                printingMethod as PrintingMethod,
              );
              if (currentLimits) {
                const aspect = bounds.w / bounds.h;
                const maxScale = computeEffectiveMaxScale(currentLimits, aspect);
                // Start the logo at its maximum allowed physical size.
                setLogoScale([maxScale]);
              }
              // If no limits apply (non-drinkware products), keep scale = 50.
            } catch {
              // Measurement failed -- keep the default scale; physical limits
              // will still be enforced via the resize clamps below.
            }

            // Multi-component gift sets only: the one uploaded logo is the
            // whole set's logo, so it's automatically made available to
            // every OTHER customizable component now, each with its own
            // independent default placement (see propagateLogoToOtherComponents).
            propagateLogoToOtherComponents({
              logo: url,
              logoFile: file,
              logoBase64: base64,
              logoDataUrl: result,
              uvLogo: res.uvLogoUrl,
              laserLogo: res.laserLogoUrl,
              logoNaturalDims: bounds,
            });
          }
        } catch (error: any) {
          console.error("Failed to process logo:", error);
          toast.error("Network Error: " + (error.message || String(error)));
          setUvLogo(null);
          setLaserLogo(null);
        } finally {
          setIsProcessingLaser(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogo(null);
    setLogoFile(null);
    setLogoBase64(null);
      setLogoDataUrl(null);
      setIsSelected(false);
    // Multi-component gift sets: there's one shared logo for the whole set,
    // so removing it clears every component's customization, not just the
    // currently active one.
    if (isMultiComponentGiftSet) {
      setComponentStates({});
    }
  };

  const handleResetPosition = () => {
    setLogoPos({ x: 0, y: 0 });
    logoMotionX.set(0);
    logoMotionY.set(0);
    setLogoRotation([0]);
    // Reset to the physical maximum for the current method (or 50 if unconstrained).
    const resetScale = brandingLimits && logoNaturalDims
      ? computeEffectiveMaxScale(brandingLimits, logoAspect)
      : 50;
    setLogoScale([resetScale]);
    setFlipH(false);
    setFlipV(false);
  };

  /**
   * Screenshots the exact rendered customization -- product image, logo at
   * its actual dragged position/size/rotation/flip, current printing-method
   * visual treatment -- excluding every editing-only element (drag handles,
   * selection box, dotted printable boundary, the "Drag logo to position
   * it" tooltip): all four are already marked with the shared "no-capture"
   * class that `ignoreElements` strips out, so this reuses the exact same
   * rendered composition the customer saw rather than reconstructing it
   * from x/y/scale/rotation numbers. Deselecting first and waiting a tick
   * lets that (and any other pending render, e.g. a logo swap still
   * in-flight) commit before the snapshot is taken.
   */
  const captureCustomizationSnapshot = async (): Promise<string> => {
    if (!previewContainerRef.current) {
      console.error("[QuoteSnapshot] previewContainerRef is null -- cannot capture");
      return "";
    }
    setIsSelected(false);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const canvas = await html2canvas(previewContainerRef.current, {
        useCORS: true,
        scale: 1,
        backgroundColor: "#F9FAFB",
        ignoreElements: (element) => element.classList.contains("no-capture"),
      });
      const dataUrl = canvas.toDataURL("image/png");
      console.log(`[QuoteSnapshot] captured, length=${dataUrl.length}`);
      return dataUrl;
    } catch (err) {
      // Deliberately NOT silent: a tainted canvas (e.g. a cross-origin
      // product image the CDN didn't serve with the right CORS headers)
      // throws a SecurityError right here on toDataURL(), and swallowing
      // it is exactly what made this failure invisible before.
      console.error("[QuoteSnapshot] html2canvas capture failed:", err);
      return "";
    }
  };

  /** Polls productImageRef until it's showing `expectedSrc` (when given) AND
   * that exact image has finished loading, so a capture never races a
   * still-loading <img> OR a stale one left over from the previously
   * active component. Capped so a slow/broken image can't hang the flow
   * forever -- captures whatever's there once the cap is hit. */
  const waitForActiveImageLoad = async (expectedSrc?: string, maxWaitMs = 3000) => {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const img = productImageRef.current;
      const srcMatches = !expectedSrc || img?.getAttribute("src") === expectedSrc;
      if (img && srcMatches && img.complete && img.naturalWidth > 0) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  /**
   * Fires when the user leaves the "customize" step. The snapshot(s) MUST be
   * captured here, not inside submitQuote: previewContainerRef (and, for a
   * multi-component set, the component selector itself) only exist while
   * `step === "customize"` is rendered (see the JSX below), so by the time
   * the user reaches the quote form's own submit button that DOM has
   * already unmounted -- capturing there would silently send an empty
   * preview. Also refuses to proceed while a just-uploaded logo's laser/UV
   * variants are still processing, so a snapshot can never show the
   * "Processing Logo..." spinner instead of the real logo.
   *
   * For a multi-component gift set, this walks through every component
   * that actually has a logo, switching the flat editing buffer to it
   * (exactly like selectComponent), waiting for that component's own photo
   * to finish loading, then reusing captureCustomizationSnapshot completely
   * unchanged -- so each capture is the same real, clean, rendered
   * composition the customer saw, per component, not a reconstruction.
   */
  // Mobile Step 1 -> Step 2. No snapshot capture and no quote submission
  // happens here -- that's still only handleProceedToQuote (Step 2's
  // "Request a Quote" button, untouched). Same concurrency guard
  // handleProceedToQuote already uses, reused for consistency rather than
  // introducing a new rule: a logo isn't required to continue (the
  // existing workflow never required one before this change either), but
  // navigating away while the just-uploaded one is still mid-processing
  // would leave the live editing buffer in a half-finished state.
  const handleContinueToMobileStep2 = () => {
    if (logo && isProcessingLaser) {
      toast.info("Please wait a moment for your logo to finish processing.");
      return;
    }
    setMobileStep(2);
  };
  const handleBackToMobileStep1 = () => setMobileStep(1);

  const handleProceedToQuote = async () => {
    if (logo && isProcessingLaser) {
      toast.info("Please wait a moment for your logo to finish processing.");
      return;
    }
    setIsCapturingSnapshot(true);
    try {
      if (isMultiComponentGiftSet) {
        const finalStates: Record<string, ComponentCustomization> = { ...componentStates };
        if (activeComponentIndex !== null) {
          const currentId = giftSetComponentsList[activeComponentIndex]?.id;
          if (currentId) finalStates[currentId] = currentFlatComponentState();
        }

        const previews: Record<string, string> = {};
        for (let i = 0; i < giftSetComponentsList.length; i++) {
          const comp = giftSetComponentsList[i]!;
          const state = finalStates[comp.id];
          if (!state?.logo) continue;
          // Always switch explicitly, even if `i` looks like it's already
          // the active component: `activeComponentIndex` here is a value
          // closed over when this function started and never updates for
          // the rest of this call, even though setActiveComponentIndex
          // below DOES really change the DOM each iteration. Skipping the
          // switch for whichever component happened to be active when the
          // user clicked "Request a Quote" meant that component's capture
          // silently reused whatever photo the PREVIOUS loop iteration had
          // switched the DOM to -- confirmed live: both components' capture
          // logged the exact same <img src> (the one from the iteration
          // before). Unconditionally re-applying state + switching for
          // every component removes the dependency on that stale value.
          applyComponentStateToFlatBuffer(state);
          setActiveComponentIndex(i);
          await new Promise((r) => setTimeout(r, 50));
          // Same resolution activeComponentImageUrl itself uses (variant
          // match, else the component's own base image) -- computed here,
          // not read back off `activeComponent`, since that's derived from
          // React state that (per the comment above) this closure won't see
          // update mid-loop.
          const expectedSrc = comp.variantImages?.find((v) => v.title === selectedVariant?.title)?.imageUrl
            ?? comp.imageUrl;
          await waitForActiveImageLoad(expectedSrc);
          previews[comp.id] = await captureCustomizationSnapshot();
        }
        setComponentPreviews(previews);
        setFinalComponentStates(finalStates);
      } else {
        const snapshot = await captureCustomizationSnapshot();
        setCustomizationSnapshot(snapshot);
      }
      setStep("quote");
    } finally {
      setIsCapturingSnapshot(false);
    }
  };

  const submitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      // For a multi-component gift set, build one structured entry per
      // component from the state + previews captured in handleProceedToQuote
      // -- each component's own logo/size/position/rotation/flip AND its own
      // real captured mockup, never a single flattened top-level value that
      // can't say which item actually got the logo.
      const giftSetCustomizations = isMultiComponentGiftSet
        ? giftSetComponentsList.map((comp) => {
            const state = finalComponentStates[comp.id];
            if (!state?.logo || !state.logoFile || !state.logoBase64) {
              return { component: comp.name, customized: false as const };
            }
            const mm = getComponentDisplayMm(state);
            return {
              component: comp.name,
              customized: true as const,
              logo: state.logoFile.name,
              widthMm: mm?.wMm,
              heightMm: mm?.hMm,
              position: state.logoPos,
              rotation: state.logoRotation,
              flip: state.flipH && state.flipV ? "both" : state.flipH ? "horizontal" : state.flipV ? "vertical" : "none",
              previewImage: componentPreviews[comp.id] || "",
            };
          })
        : undefined;

      // Backward-compatible single top-level logo/preview: for a multi-
      // component set this is the FIRST customized component, so any
      // existing code reading these flat fields still sees something
      // sensible -- the complete, authoritative data is giftSetCustomizations.
      const primaryCustomized = isMultiComponentGiftSet
        ? giftSetComponentsList.map((c) => finalComponentStates[c.id]).find((s) => s?.logo)
        : undefined;
      const effLogoFile = isMultiComponentGiftSet ? primaryCustomized?.logoFile ?? null : logoFile;
      const effLogoBase64 = isMultiComponentGiftSet ? primaryCustomized?.logoBase64 ?? null : logoBase64;
      const effScale = isMultiComponentGiftSet ? primaryCustomized?.logoScale : logoScale[0];
      const effRotation = isMultiComponentGiftSet ? primaryCustomized?.logoRotation : logoRotation[0];
      const effFlipH = isMultiComponentGiftSet ? (primaryCustomized?.flipH ?? false) : flipH;
      const effFlipV = isMultiComponentGiftSet ? (primaryCustomized?.flipV ?? false) : flipV;
      const effLogoPos = isMultiComponentGiftSet ? primaryCustomized?.logoPos : logoPos;
      // Same value the on-screen "Your Customization" summary displays
      // (summaryPreviewSrc, computed once above render) -- the submitted
      // preview and the one the shopper confirmed on screen are
      // guaranteed to be the exact same image.
      const previewBase64 = summaryPreviewSrc;

      const result = await submitCorporateQuote({
        data: {
          fullName: formData.fullName,
          company: formData.company,
          email: formData.email,
          phone: formData.phone,
          quantity: parseInt(formData.quantity, 10),
          deliveryDate: formData.deliveryDate,
          location: formData.location,
          requirements: formData.requirements,
          printingMethod: printingMethod,
          product: {
            id: product.id || product.slug,
            name: product.name,
            variant: selectedVariant?.title || product.variants?.[0]?.title,
            // Read live from the selectedVariant PROP at submit time (never
            // frozen into local state earlier), so a variant switch right
            // before clicking Request a Quote is always what gets recorded
            // -- never a stale id left over from an earlier selection.
            variantId: selectedVariant?.id,
          },
          logo: effLogoFile && effLogoBase64 ? {
            name: effLogoFile.name,
            mimeType: effLogoFile.type,
            content: effLogoBase64,
            scale: effScale,
            rotation: effRotation,
            flipH: effFlipH,
            flipV: effFlipV,
            x: effLogoPos?.x,
            y: effLogoPos?.y,
            // The exact Width/Height (mm) the customer sees and typed in the
            // Logo Size fields -- read directly from that same state, NOT
            // recomputed from logoScale/percentage, so the PDF can never
            // show a different number than what was on screen. Only
            // meaningful for Corporate Gifting products (sizeInputW/H stay
            // "" otherwise, see mmConversionLimits); omitted rather than
            // sent as NaN when unset or mid-edit.
            ...(!isMultiComponentGiftSet && isFinite(parseFloat(sizeInputW)) && isFinite(parseFloat(sizeInputH))
              ? { widthMm: parseFloat(sizeInputW), heightMm: parseFloat(sizeInputH) }
              : {}),
            ...(isMultiComponentGiftSet && primaryCustomized
              ? (() => {
                  const mm = getComponentDisplayMm(primaryCustomized);
                  return mm ? { widthMm: mm.wMm, heightMm: mm.hMm } : {};
                })()
              : {}),
          } : undefined,
          previewImage: previewBase64,
          ...(giftSetCustomizations ? { giftSetCustomizations } : {}),
        }
      });
      if (!result.ok) throw new Error(result.error);
        trackLead("Corporate Quote", { email: formData.email, phone: formData.phone }, { content_name: product.name });
        setRefNumber(result.refNumber);
        toast.success("Quote request submitted successfully! We will contact you shortly.");
        onOpenChange(false);
        setTimeout(() => setStep("customize"), 300);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to submit quote. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.stopPropagation(); 
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const angle = (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;
      initialPinchRef.current = { dist, angle, initialScale: logoScale[0]!, initialRot: logoRotation[0]! };
      pinchWarnedRef.current = false; // reset per-gesture warning
    } else {
      initialPinchRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchRef.current) {
      e.preventDefault(); 
      e.stopPropagation();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scaleMultiplier = dist / initialPinchRef.current.dist;
      let newScale = initialPinchRef.current.initialScale * scaleMultiplier;
      // Hard clamp: never exceed the physical branding-size maximum.
      const hitMax = newScale > effectiveMaxScale;
      newScale = Math.max(minEffectiveScale, Math.min(effectiveMaxScale, newScale));
      if (hitMax && !pinchWarnedRef.current && isCorporateGifting) {
        pinchWarnedRef.current = true;
        toast.info(maxSizeToastMessage());
      }
      setLogoScale([Math.round(newScale)]);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      initialPinchRef.current = null;
    }
  };

  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const motionDiv = (e.currentTarget as HTMLElement).parentElement?.parentElement;
    if (!motionDiv) return;
    const rect = motionDiv.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    const startScale = logoScale[0]!;
    // Show the max-size warning at most once per drag gesture
    let hasWarnedMax = false;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const dist = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
      const ratio = dist / startDist;
      let newScale = startScale * ratio;
      // Hard clamp: never exceed the physical branding-size maximum.
      const hitMax = newScale > effectiveMaxScale;
      newScale = Math.max(minEffectiveScale, Math.min(effectiveMaxScale, newScale));
      if (hitMax && !hasWarnedMax && isCorporateGifting) {
        hasWarnedMax = true;
        toast.info(maxSizeToastMessage());
      }
      setLogoScale([newScale]);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsSelected(false);
    }
  };

  if (!product) return null;

  // The single source of truth for "what does this customization actually
  // look like" -- a real html2canvas capture of the live customizer
  // preview (captureCustomizationSnapshot, run once per component in
  // handleProceedToQuote right as the shopper leaves the "customize"
  // step), not a second, hand-reconstructed rendering of the product photo
  // + a repositioned/rescaled logo layer. The "Your Customization" summary
  // below and the actual quote submission (submitQuote) both read this
  // same value, so there is exactly one place that decides what the
  // confirmed placement looked like -- they can't drift apart.
  const summaryPreviewSrc = isMultiComponentGiftSet
    ? (giftSetComponentsList.map((c) => componentPreviews[c.id]).find(Boolean) ?? "")
    : customizationSnapshot;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* overflow-y was overflow-y-auto below md, md:overflow-hidden at
          md+ -- below lg the "customize" step used to be one tall column
          the whole dialog scrolled. The new mobile 2-step slider manages
          its own internal per-pane scrolling instead (a fixed-height
          horizontal track, same as the desktop column already did at
          md+), so overflow-y-hidden now applies at every width; nothing
          else in this className changed. */}
      <DialogContent className="max-w-[1200px] w-screen h-[100dvh] max-h-none border-0 m-0 p-0 overflow-x-hidden overflow-y-hidden flex flex-col rounded-none sm:rounded-2xl md:w-[95vw] md:h-[90vh] md:max-h-[900px] md:border">
        {step === "customize" && (() => {
          // The 3 pieces below render byte-identically to before this
          // change -- same elements, classes, refs and handlers, just
          // captured as local JSX so the mobile 2-step layout further down
          // can place them into its own pane structure instead of
          // duplicating ~250 lines of markup (and, critically, instead of
          // ever mounting two copies at once -- see isMobileLayout above:
          // exactly one of the two `return`s below actually renders per
          // render, so previewContainerRef/productImageRef/constraintsRef
          // are never attached to two DOM nodes at the same time).
          const previewPane = (
            <div
              className="w-full lg:flex-1 bg-[#F9FAFB] relative flex items-center justify-center p-4 lg:p-12 border-b lg:border-b-0 lg:border-r border-border min-h-[50vh] lg:min-h-full overflow-hidden"
              onClick={handleCanvasClick}
            >
              {/* absolute inset-0, not "relative w-full h-full": this div's
                  parent (previewPane, just above) gets its height from
                  min-h-[50vh]/lg:min-h-full -- CSS only treats an ancestor's
                  height as "definite" for a DESCENDANT's percentage height
                  to resolve against when that height comes from an
                  explicit `height`, not `min-height` alone (confirmed live:
                  h-full was computing to 0px here once this became the
                  mobile layout's own standalone preview region, collapsing
                  the image to nothing). inset-0 sidesteps that rule
                  entirely -- an absolutely positioned element's containing
                  block is the nearest positioned ancestor's actual
                  rendered padding box, not a percentage resolved against a
                  "specified" height. */}
              <div
                ref={previewContainerRef}
                className="absolute inset-0 max-h-full flex flex-col items-center justify-center bg-[#F9FAFB]"
                onClick={handleCanvasClick}
              >
                <img
                  ref={productImageRef}
                  src={previewImage}
                  alt="Product preview"
                  crossOrigin="anonymous"
                  onLoad={handleProductImageLoad}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none drop-shadow-sm"
                />

                {/* Drag boundary: position/size come entirely from
                    activeBoundaryPx (this product's printable area, or the
                    full image bounds for a gift set -- see isGiftSet
                    above), never a fixed percentage of the panel. It moves/
                    resizes with it on every recompute (resize, variant
                    change, load). constraintsRef is measured directly by
                    Framer Motion's `dragConstraints` below, so the drag
                    boundary is always exactly this same rect -- for a gift
                    set, or any other non-Drinkware Corporate Gifting
                    product (see hideVisibleBoundary), the border classes
                    are always transparent (no dotted rectangle ever
                    drawn), but the div itself still exists so the drag
                    still has a real boundary to measure. */}
                <div
                  ref={constraintsRef}
                  className={`absolute transition-all duration-300 pointer-events-none rounded-xl no-capture
                    ${!hideVisibleBoundary && isDragging ? "border-2 border-dashed border-primary/40 bg-primary/5" : "border-2 border-dashed border-transparent"}
                  `}
                  style={{
                    left: dragBoundaryPx.left,
                    top: dragBoundaryPx.top,
                    width: dragBoundaryPx.width,
                    height: dragBoundaryPx.height,
                  }}
                />
                
                {logo && (
                  // This wrapper is inset-0 -- exactly congruent with
                  // previewContainerRef's own content box -- so it changes
                  // NOTHING about the motion.div's positioning coordinate
                  // system (its `absolute` still resolves to the identical
                  // pixel position as a direct previewContainerRef child
                  // would). Its only job is the Drinkware clip-path: a
                  // CSS-level clip that hard-cuts anything rendered outside
                  // the 70x140mm boundary regardless of HOW it got there
                  // (drag, resize, rotate), applied here rather than on
                  // constraintsRef so it never affects the drag-boundary
                  // measurement Framer Motion reads. `undefined` (every
                  // non-Drinkware product) means no clip-path at all --
                  // purely a pass-through wrapper, no visual change.
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={logoClipPath ? { clipPath: logoClipPath } : undefined}
                  >
                  <motion.div
                    // THE actual root cause of "dragging one component's
                    // logo also moves another's": Framer Motion's `drag`
                    // tracks position via its OWN internal transform once a
                    // drag happens, and does NOT reliably re-sync from a
                    // plain style.x/y on every re-render -- so switching
                    // components (which updates logoPos in React state)
                    // still left the DOM element wherever the LAST drag put
                    // it. The state itself was always correctly isolated
                    // per component (see selectComponent/componentStates);
                    // this is a rendering-layer fix, not a state fix: a
                    // `key` that changes with the active component forces
                    // React to unmount/remount this element, which resets
                    // Framer's internal drag transform so the new render's
                    // style.x/y (logoPos) actually takes effect as a fresh
                    // starting position.
                    //
                    // style.x/y below are bound to logoMotionX/Y (Framer
                    // MotionValues), not plain numbers: dragConstraints +
                    // dragElastic clamp the LIVE rendered position during a
                    // drag (e.g. a small component's printable area can't
                    // fit the same pointer travel a large one can), and that
                    // clamped result is only ever reflected in Framer's own
                    // motion value -- never in PanInfo (info.point/info.offset
                    // are raw, unclamped pointer deltas). Reconstructing the
                    // resting position by hand from PanInfo therefore drifted
                    // from what was actually on screen the moment the
                    // boundary was hit. Binding style.x/y directly to the
                    // motion values means the DOM is always driven by
                    // Framer's own clamped truth, and reading `.get()` off
                    // them (below, and in selectComponent's save step) always
                    // returns exactly that same rendered value -- settled
                    // elastic snap-back included.
                    drag
                    dragConstraints={constraintsRef}
                    dragElastic={0.05}
                    dragMomentum={false}
                    onDragStart={() => {
                      setIsDragging(true);
                      setIsSelected(true);
                    }}
                    onDragEnd={() => {
                      setIsDragging(false);
                      setLogoPos({ x: logoMotionX.get(), y: logoMotionY.get() });
                    }}
                    onDragTransitionEnd={() => {
                      // Fires once any post-release elastic snap-back spring
                      // (dragConstraints + dragElastic) finishes settling --
                      // which happens AFTER onDragEnd, so logoPos must be
                      // re-synced here too or a save (switching components
                      // right after a boundary-clamped drag) could capture
                      // the still-mid-animation value instead of the final
                      // rest position.
                      setLogoPos({ x: logoMotionX.get(), y: logoMotionY.get() });
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSelected(true);
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    className={`pointer-events-auto absolute z-10 flex items-center justify-center cursor-move touch-none transition-shadow`}
                    style={{
                      width: `${logoScale[0]}%`,
                      maxWidth: "100%",
                      rotate: logoRotation[0] ?? 0,
                      mixBlendMode: activeMixBlend,
                      touchAction: "none",
                      opacity: 0.95,
                      x: logoMotionX,
                      y: logoMotionY,
                    }}
                  >
                    {isProcessingLaser ? (
                        <div className="flex flex-col items-center justify-center p-4 bg-background/80 rounded-lg shadow-sm border border-border backdrop-blur-sm">
                          <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                          <span className="text-xs font-medium">Processing Logo...</span>
                        </div>
                      ) : (
                        <img src={currentDisplayLogo || ""} alt="Custom Logo" crossOrigin="anonymous" className="w-full h-auto object-contain pointer-events-none" style={{ transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`, mixBlendMode: activeMixBlend as any, filter: printingMethod === "Laser Engraving" ? laserDropShadow : "drop-shadow(0 4px 6px -1px rgb(0 0 0 / 0.1))" }} />
                      )}
                    
                    {isSelected && (
                      <div className="no-capture absolute inset-0 pointer-events-none">
                        <div className="absolute -inset-[1.5px] border-[1.5px] border-primary pointer-events-none" />
                        <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-nwse-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-nesw-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-nesw-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-nwse-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-1.5 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-ew-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-1.5 h-3 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-ew-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-1.5 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-ns-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-1.5 bg-white border-[1.5px] border-primary rounded-sm shadow-sm cursor-ns-resize pointer-events-auto" onPointerDown={handleResizeStart} />
                      </div>
                    )}
                  </motion.div>
                  </div>
                )}

                {logo && isSelected && !isDragging && (
                  <div className="no-capture absolute bottom-8 bg-background/90 backdrop-blur-sm border border-border shadow-sm text-xs font-medium px-4 py-2 rounded-full pointer-events-none animate-in fade-in slide-in-from-bottom-2">
                    <span className="hidden sm:inline">Drag logo to position it</span><span className="sm:hidden">Pinch to resize • Drag to position</span>
                  </div>
                )}
              </div>
            </div>
          );

          // Desktop-only: "Back to Product", the "Customize Product" title
          // and its description. Split out from logoControlsContent (used
          // on both branches) rather than removed from it outright, so
          // desktop keeps this exactly as it was -- only the mobile Step 1
          // pane omits it now (the dialog's own close "X" and Step 2's
          // "Back to Logo" already cover exit/back-navigation on mobile).
          const desktopHeaderBlock = (
            <DialogHeader className="mb-8">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-6 sm:hidden"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Product
              </button>
              <DialogTitle className="text-2xl font-bold tracking-tight">Customize Product</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Add your company branding and see how your corporate gift could look.
              </DialogDescription>
            </DialogHeader>
          );

          const logoControlsContent = (
            <>
                  <div className="space-y-10">
                    {isMultiComponentGiftSet && (
                      <div className="space-y-2">
                        <Label className="text-base font-semibold">
                          Gift Set Components <span className="font-normal text-muted-foreground">({giftSetComponentsList.length} items)</span>
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {giftSetComponentsList.map((comp, idx) => {
                            const customized = isComponentCustomized(idx);
                            const active = idx === activeComponentIndex;
                            const mm = customized ? getComponentDisplayMm(getComponentState(idx)) : null;
                            return (
                              <button
                                key={comp.id}
                                type="button"
                                disabled={!comp.customizable}
                                onClick={() => selectComponent(idx)}
                                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                                  active
                                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                    : "border-border hover:bg-muted/50"
                                } ${!comp.customizable ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                              >
                                <img
                                  src={comp.variantImages?.find((v) => v.title === selectedVariant?.title)?.imageUrl ?? comp.imageUrl}
                                  alt={comp.name}
                                  className="w-9 h-9 rounded-lg object-cover border border-border/50 bg-muted/30 shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate max-w-[110px]">{comp.name}</div>
                                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    {!comp.customizable ? (
                                      "Not customizable"
                                    ) : customized ? (
                                      <>
                                        <Check className="w-3 h-3 text-primary shrink-0" />
                                        {mm ? `${mm.wMm.toFixed(1)}×${mm.hMm.toFixed(1)}mm` : "Customized"}
                                      </>
                                    ) : (
                                      "Not customized"
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</div>
                        <Label className="text-base font-semibold">
                          {isMultiComponentGiftSet && activeComponent ? `Add Your Logo — ${activeComponent.name}` : "Add Your Logo"}
                        </Label>
                      </div>
                      
                      {!logo ? (
                        <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-center bg-muted/20 hover:bg-muted/50 transition-colors cursor-pointer group">
                          <div className="w-12 h-12 rounded-full bg-background border border-border shadow-sm flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                            <Upload className="w-5 h-5 text-foreground/70" />
                          </div>
                          <span className="text-sm font-medium text-foreground">Upload Logo</span>
                          <span className="text-[13px] text-muted-foreground mt-2 max-w-[240px] leading-relaxed">
                            For best results, use a high-resolution image with a transparent background.
                          </span>
                          <input 
                            type="file" 
                            accept="image/png, image/jpeg, image/svg+xml" 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleLogoUpload}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-3 border border-border rounded-xl bg-background shadow-sm">
                          <div className="flex items-center space-x-4 overflow-hidden">
                            <div className="w-12 h-12 bg-muted/50 rounded-lg p-1.5 border border-border/50 flex items-center justify-center">
                              {isProcessingLaser ? (
                                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                ) : (
                                  <img src={logoDataUrl || undefined} alt="Thumb" className="w-full h-full object-contain" style={{ mixBlendMode: activeMixBlend, filter: printingMethod === "Laser Engraving" ? laserDropShadow : "none" }} />
                                )}
                            </div>
                            <span className="text-sm font-medium truncate max-w-[150px]">{logoFile?.name || "logo.png"}</span>
                          </div>
                          <Button variant="ghost" size="icon" onClick={handleRemoveLogo} className="text-muted-foreground hover:text-destructive h-8 w-8">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className={`space-y-5 transition-opacity duration-300 ${!logo ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</div>
                        <Label className="text-base font-semibold">Position Your Logo</Label>
                      </div>
                      
                      <p className="text-sm text-muted-foreground pl-9">
                        Drag your logo directly onto the product to place it.
                      </p>

                      <div className="pl-9 space-y-6 pt-2">

                        {/* ── Logo Size mm control ─────────────────────────── */}
                        {mmConversionLimits && logoNaturalDims && logo && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs font-medium text-foreground/80">Logo Size</Label>
                              <Lock className="w-3 h-3 text-muted-foreground/50" aria-label="Aspect ratio locked" />
                            </div>
                            <div className="flex items-center gap-3">
                              {/* Width */}
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-muted-foreground">Width</span>
                                <div className="flex items-center gap-1">
                                  <Input
                                    id="logo-size-width"
                                    type="number"
                                    step="0.1"
                                    min={0.1}
                                    value={sizeInputW}
                                    onChange={e => handleWidthChange(e.target.value)}
                                    onBlur={syncInputsFromScale}
                                    onKeyDown={e => e.key === "Enter" && syncInputsFromScale()}
                                    className="w-[4.5rem] h-8 text-sm text-center px-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    aria-label="Logo width in millimetres"
                                  />
                                  <span className="text-xs text-muted-foreground select-none">mm</span>
                                </div>
                              </div>

                              {/* Ratio lock divider */}
                              <div className="flex flex-col items-center gap-0.5 pt-4 text-muted-foreground/40 select-none" aria-hidden>
                                <div className="w-px h-2.5 bg-current" />
                                <span className="text-[10px] font-medium leading-none">×</span>
                                <div className="w-px h-2.5 bg-current" />
                              </div>

                              {/* Height */}
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-muted-foreground">Height</span>
                                <div className="flex items-center gap-1">
                                  <Input
                                    id="logo-size-height"
                                    type="number"
                                    step="0.1"
                                    min={0.1}
                                    value={sizeInputH}
                                    onChange={e => handleHeightChange(e.target.value)}
                                    onBlur={syncInputsFromScale}
                                    onKeyDown={e => e.key === "Enter" && syncInputsFromScale()}
                                    className="w-[4.5rem] h-8 text-sm text-center px-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    aria-label="Logo height in millimetres"
                                  />
                                  <span className="text-xs text-muted-foreground select-none">mm</span>
                                </div>
                              </div>

                              {/* Live longest-dim indicator */}
                              <div className="flex flex-col gap-1 pt-4">
                                <span className="text-[10px] text-muted-foreground/70 leading-none">
                                  {/* Drinkware: raw integer, byte-for-byte the original "max 30 mm"
                                      label. Every other Corporate Gifting product: one decimal, since
                                      the geometric max is rarely a round number. */}
                                  max {brandingLimits ? displayMaxLongestMm : displayMaxLongestMm.toFixed(1)} mm
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs font-medium text-foreground/80">Rotation</Label>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {[0, 90, 180].map(angle => (
                              <Button 
                                key={angle}
                                type="button"
                                variant={logoRotation[0] === angle ? "default" : "outline"}
                                className="h-9 font-medium"
                                onClick={() => setLogoRotation([angle])}
                              >
                                {angle}°
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs font-medium text-foreground/80">Flip</Label>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button 
                              type="button"
                              variant={flipH ? "default" : "outline"}
                              className="h-9 font-medium"
                              onClick={() => setFlipH(prev => !prev)}
                            >
                              <FlipHorizontal2 className="w-4 h-4 mr-2" />
                              Horizontal
                            </Button>
                            <Button 
                              type="button"
                              variant={flipV ? "default" : "outline"}
                              className="h-9 font-medium"
                              onClick={() => setFlipV(prev => !prev)}
                            >
                              <FlipVertical2 className="w-4 h-4 mr-2" />
                              Vertical
                            </Button>
                          </div>
                        </div>

                        <div>
                          <Button variant="outline" size="sm" onClick={handleResetPosition} className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
                            <RotateCw className="w-3 h-3 mr-2" />
                            Reset Adjustments
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
            </>
          );

          const footerControlsContent = (
            <>
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base font-semibold">Quantity</Label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Min 1</span>
                    <div className="inline-flex h-9 w-24 shrink-0 items-center border border-input rounded-md overflow-hidden bg-background">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() => setFormData(prev => ({ ...prev, quantity: String(Math.max(1, quantityNum - 1)) }))}
                        className="px-2 h-full flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <Minus className="w-3 h-3" strokeWidth={2} />
                      </button>
                      <Input
                        type="number"
                        min={1}
                        value={formData.quantity}
                        onChange={e => {
                          const val = parseInt(e.target.value, 10);
                          if (val < 1) return;
                          setFormData({...formData, quantity: e.target.value});
                        }}
                        className="flex-1 min-w-0 h-full border-0 rounded-none bg-transparent px-1 font-medium text-center shadow-none focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => setFormData(prev => ({ ...prev, quantity: String(quantityNum + 1) }))}
                        className="px-2 h-full flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <Plus className="w-3 h-3" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="mb-6 space-y-3">
                  <Label className="text-sm font-semibold">Printing Method</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setUserSelectedPrintingMethod("Laser Engraving")}
                      className={`p-3 rounded-lg border flex flex-col items-center justify-center text-sm font-medium transition-all ${
                        printingMethod === "Laser Engraving"
                          ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/20"
                          : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      Laser Engraving
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserSelectedPrintingMethod("UV Printing")}
                      disabled={!isUvAvailable}
                      className={`p-3 rounded-lg border flex flex-col items-center justify-center text-sm font-medium transition-all ${
                        !isUvAvailable 
                          ? "opacity-50 cursor-not-allowed bg-muted/50 border-border" 
                          : printingMethod === "UV Printing"
                            ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/20"
                            : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <span>UV Printing</span>
                      {!isUvAvailable && <span className="text-[10px] mt-1 font-normal">Min. 25 units</span>}
                    </button>
                  </div>
                </div>

                {/* Per-item status/size already live in the Gift Set
                    Components chips above -- this is just the one thing
                    that isn't shown elsewhere. No "logo application" choice
                    here anymore: the one uploaded logo is automatically the
                    whole set's logo (see propagateLogoToOtherComponents). */}
                {isMultiComponentGiftSet && (selectedVariant?.title || product.variants?.[0]?.title) && (
                  <p className="mb-4 text-sm">
                    <span className="text-muted-foreground">Variant: </span>
                    <span className="font-medium">{selectedVariant?.title || product.variants?.[0]?.title}</span>
                  </p>
                )}

                <Button
                  className="w-full text-base h-14 font-semibold shadow-sm"
                  size="lg"
                  onClick={handleProceedToQuote}
                  disabled={isCapturingSnapshot}
                >
                  {isCapturingSnapshot ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    "Request a Quote"
                  )}
                </Button>
                
                <p className="text-[11px] text-center text-muted-foreground mt-4 leading-relaxed max-w-[300px] mx-auto">
                  Preview is for visualization purposes. Final branding placement may vary slightly depending on the product and production method.
                </p>
            </>
          );

          if (isMobileLayout) {
            return (
              <div className="flex flex-col h-full min-h-0">
                {/* Compact step indicator -- "1 — Logo" / "2 — Printing",
                    plus a "Step N of 2" line for the progress-indicator
                    requirement. "1 — Logo" is a real button once Step 2 is
                    showing (a second way back, per the bug report, besides
                    the "Back to Logo" control at the bottom of Step 2) --
                    the current step is never clickable, and Step 2 is never
                    clickable from Step 1 (no skipping ahead of Continue).
                    Purely a label/shortcut either way; mobileStep (set only
                    by Continue/Back) is the single source of truth for
                    which pane shows. */}
                <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border bg-background">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Step {mobileStep} of 2</p>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {mobileStep === 2 ? (
                      <button
                        type="button"
                        onClick={handleBackToMobileStep1}
                        className="text-foreground underline underline-offset-2 decoration-muted-foreground/50 hover:decoration-foreground"
                      >
                        1 — Logo
                      </button>
                    ) : (
                      <span className="text-foreground">1 — Logo</span>
                    )}
                    <span className="h-px flex-1 bg-border" aria-hidden />
                    <span className={mobileStep === 2 ? "text-foreground" : "text-muted-foreground"}>2 — Printing</span>
                  </div>
                </div>

                {/* Fixed product preview -- a sibling of the sliding
                    viewport below, not inside it, so it's never translated
                    and never re-measured/remounted on a step change. There
                    is exactly one previewPane element (built once, above);
                    this is the only place it's inserted into the mobile
                    tree, so the drag/resize engine's refs
                    (previewContainerRef/productImageRef/constraintsRef)
                    still only ever attach to one DOM node. */}
                <div className="shrink-0">
                  {previewPane}
                </div>

                {/* Viewport: each pane below is independently positioned
                    (absolute, inset-0) and slides fully in/out of THIS
                    box's own bounds -- not a shared double-wide track. Each
                    pane's width is therefore always just 100% of this
                    viewport, not a fraction of a fraction, which is both
                    simpler to reason about and avoids depending on two
                    nested percentage-width calculations agreeing with each
                    other. overflow-hidden here (plus the dialog's own
                    overflow-x-hidden) means the off-screen pane can never
                    cause page-level horizontal scroll. Only this viewport
                    -- never the step indicator or the preview above --
                    participates in the slide. */}
                <div className="relative flex-1 min-h-0 overflow-hidden">
                  {/* Pane 1 — Add & Position Your Logo (configuration only;
                      the preview itself now lives above, outside the
                      track) */}
                  <div
                    ref={mobilePane1Ref}
                    tabIndex={-1}
                    aria-hidden={mobileStep !== 1}
                    inert={mobileStep !== 1}
                    className="absolute inset-0 flex flex-col overflow-y-auto outline-none transition-transform duration-300 ease-out motion-reduce:transition-none motion-reduce:duration-0"
                    style={{ transform: mobileStep === 1 ? "translateX(0%)" : "translateX(-100%)" }}
                  >
                    <div className="p-6">
                      {logoControlsContent}
                    </div>
                    <div className="p-6 border-t border-border bg-background mt-auto">
                      <Button
                        className="w-full h-14 text-base font-semibold shadow-sm"
                        size="lg"
                        onClick={handleContinueToMobileStep2}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>

                  {/* Pane 2 — Printing Method & Quantity */}
                  <div
                    ref={mobilePane2Ref}
                    tabIndex={-1}
                    aria-hidden={mobileStep !== 2}
                    inert={mobileStep !== 2}
                    className="absolute inset-0 flex flex-col overflow-y-auto outline-none transition-transform duration-300 ease-out motion-reduce:transition-none motion-reduce:duration-0"
                    style={{ transform: mobileStep === 2 ? "translateX(0%)" : "translateX(100%)" }}
                  >
                    <div className="p-6">
                      {footerControlsContent}
                    </div>
                    {/* "← Back to Logo", near the bottom alongside Request
                        a Quote -- this is a navigation-only action, never a
                        quote submission (that's still only the "Request a
                        Quote" button inside footerControlsContent, via the
                        unchanged handleProceedToQuote). */}
                    <div className="px-6 pb-6">
                      <button
                        type="button"
                        onClick={handleBackToMobileStep1}
                        className="flex w-full items-center justify-center text-sm font-medium text-muted-foreground hover:text-foreground"
                      >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Logo
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div className="flex flex-col lg:flex-row min-h-full">
              {previewPane}
              <div className="w-full lg:w-[450px] flex flex-col bg-background relative shrink-0 lg:h-full">
                <div className="flex-1 overflow-y-visible md:overflow-y-auto">
                  <div className="p-6 lg:p-8 lg:pb-4">
                    {desktopHeaderBlock}
                    {logoControlsContent}
                  </div>
                </div>
                <div className="p-6 lg:p-8 border-t border-border bg-background shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] mt-auto lg:sticky lg:bottom-0 lg:z-20">
                  {footerControlsContent}
                </div>
              </div>
            </div>
          );
        })()}

        {step === "quote" && (
          <div className="flex flex-col h-full bg-[#F9FAFB]">
            <DialogHeader className="px-6 py-5 md:px-10 md:py-8 border-b border-border bg-background pb-6 shrink-0 flex flex-row items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold tracking-tight">Request a Quote</DialogTitle>
                <DialogDescription className="mt-1.5">
                  Our team will review your requirements and contact you shortly.
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setStep("customize")} className="hidden sm:flex">
                <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Customization
              </Button>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="max-w-[1200px] mx-auto flex flex-col lg:flex-row min-h-full">
                <div className="flex-1 p-6 md:p-10 lg:pr-12">
                  <button 
                    type="button" 
                    onClick={() => setStep("customize")}
                    className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-6 sm:hidden"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Customization
                  </button>
                  <h3 className="font-semibold text-2xl sm:text-lg mb-6">Request a Quote</h3>
                  
                  {errorMsg && (
                    <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex gap-3 text-sm">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p>{errorMsg}</p>
                    </div>
                  )}

                  <form id="quote-form" onSubmit={submitQuote} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2.5">
                        <Label htmlFor="fullName">Full Name *</Label>
                        <Input id="fullName" required value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="bg-background" />
                      </div>
                      <div className="space-y-2.5">
                        <Label htmlFor="company">Company Name *</Label>
                        <Input id="company" required value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} className="bg-background" />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2.5">
                        <Label htmlFor="email">Work Email *</Label>
                        <Input id="email" type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="bg-background" />
                      </div>
                      <div className="space-y-2.5">
                        <Label htmlFor="phone">Phone Number *</Label>
                        <Input id="phone" type="tel" required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="bg-background" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2.5">
                        <Label htmlFor="date">Required Delivery Date</Label>
                        <Input id="date" type="date" value={formData.deliveryDate} onChange={e => setFormData({...formData, deliveryDate: e.target.value})} className="bg-background" />
                      </div>
                      <div className="space-y-2.5">
                        <Label htmlFor="location">Delivery Location (City/Pincode) *</Label>
                        <Input id="location" required value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="bg-background" />
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <Label htmlFor="req">Additional Requirements</Label>
                      <Textarea 
                        id="req" 
                        placeholder="Special packaging, color requests, multiple shipping addresses..." 
                        className="min-h-[100px] resize-none bg-background"
                        value={formData.requirements} 
                        onChange={e => setFormData({...formData, requirements: e.target.value})}
                      />
                    </div>
                  </form>
                </div>

                <div className="w-full lg:w-[420px] shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-background p-6 md:p-10 flex flex-col">
                  <div className="flex items-center justify-between mb-6 lg:mb-8">
                    <h3 className="font-semibold text-lg">Your Customization</h3>
                    <Button variant="ghost" size="sm" onClick={() => setStep("customize")} className="sm:hidden text-primary">
                      Edit
                    </Button>
                  </div>
                  
                  {/* summaryPreviewSrc is a real screenshot of the live
                      customizer preview (captureCustomizationSnapshot),
                      not a product photo + a separately-repositioned logo
                      layer. The old version here rebuilt the logo's
                      placement from logoPos/logoScale/logoRotation using a
                      hardcoded `* 0.3` pixel multiplier that had no actual
                      relationship to this box's size vs. the customizer's
                      own preview box -- correct only by coincidence, if
                      ever. A single flat image, scaled via object-contain,
                      can't drift from what the shopper actually confirmed:
                      whatever the box's size, the logo's position relative
                      to the product scales uniformly with it. Falls back
                      to the plain, logo-free product photo only if a
                      snapshot genuinely failed to capture (e.g. a tainted
                      canvas) -- never to a guessed placement. */}
                  <div className="w-full aspect-[4/5] bg-[#F9FAFB] rounded-xl border border-border mb-8 flex items-center justify-center p-6 relative overflow-hidden shadow-inner">
                    <img
                      src={summaryPreviewSrc || previewImage}
                      alt="Your customization"
                      className="w-full h-full object-contain pointer-events-none drop-shadow-sm"
                    />
                  </div>

                  <div className="space-y-5 text-sm flex-1">
                    <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                      <span className="text-muted-foreground">Product</span>
                      <span className="font-medium text-right text-foreground">{product.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                      <span className="text-muted-foreground">Quantity</span>
                      <span className="font-medium text-right text-foreground">{formData.quantity}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                      <span className="text-muted-foreground">Printing Method</span>
                      <span className="font-medium text-right text-foreground">{printingMethod}</span>
                    </div>
                    {logoFile ? (
                      <>
                        <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                          <span className="text-muted-foreground">Logo</span>
                          <span className="font-medium text-right text-foreground truncate" title={logoFile.name}>{logoFile.name}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                          <span className="text-muted-foreground">Customization</span>
                          <span className="font-medium text-right text-foreground">Direct Placement</span>
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border">
                        <span className="text-muted-foreground">Branding</span>
                        <span className="font-medium text-right text-foreground">Unbranded</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-6 mt-auto">
                    <Button 
                      type="submit" 
                      form="quote-form" 
                      className="w-full h-14 text-base font-semibold shadow-sm" 
                      size="lg"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        "Submit Quote Request"
                      )}
                    </Button>
                    <p className="text-[11px] text-center text-muted-foreground mt-4 leading-relaxed">
                      Final pricing depends on quantity, branding method, customization and delivery requirements.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        
      </DialogContent>
    </Dialog>
  );
}





