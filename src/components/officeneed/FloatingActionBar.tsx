import { ScanLine, Sparkles } from "lucide-react";

export function FloatingActionBar() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <div className="pointer-events-auto mx-auto grid w-full max-w-[720px] grid-cols-1 gap-2 rounded-lg border border-border bg-background/95 p-1.5 shadow-[0_8px_28px_-18px_rgb(0_0_0_/_0.45)] backdrop-blur sm:grid-cols-2">
        <a
          href="#custom-requirement"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-secondary"
        >
          <ScanLine className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
          Send Custom Requirement
        </a>
        <a
          href="#ai-recommendation"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90"
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
          AI Recommendation
        </a>
      </div>
    </div>
  );
}
