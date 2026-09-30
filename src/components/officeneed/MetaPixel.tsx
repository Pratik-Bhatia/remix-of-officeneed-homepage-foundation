import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { initMetaPixel, trackPageView } from "@/lib/meta-pixel";

/** Mounted once in the root layout: initializes the Pixel and sends one PageView per URL. */
export function MetaPixel() {
  const href = useRouterState({ select: (s) => s.location.href });
  useEffect(() => {
    initMetaPixel();
  }, []);
  useEffect(() => {
    trackPageView(href);
  }, [href]);
  return null;
}
