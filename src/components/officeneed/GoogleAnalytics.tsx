import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { trackGooglePageView } from "@/lib/google-analytics";

export function GoogleAnalytics() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    trackGooglePageView(pathname);
  }, [pathname]);
  return null;
}