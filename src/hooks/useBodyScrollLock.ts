import { useEffect } from "react";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

/** Locks page scrolling for as long as `active` is true; released on close and on unmount. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return lockBodyScroll();
  }, [active]);
}
