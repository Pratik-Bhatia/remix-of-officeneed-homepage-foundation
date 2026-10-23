import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { initClarity, isClarityAllowed } from "@/lib/clarity";

/**
 * Mounted once in the root layout. Starts Microsoft Clarity on the first route
 * whose URL is safe to record (never a password-reset / activation / auth URL),
 * then leaves navigation tracking to Clarity's own tag.
 */
export function Clarity() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  useEffect(() => {
    if (isClarityAllowed(pathname, search ?? "")) initClarity();
  }, [pathname, search]);
  return null;
}
