import { ScanLine, LayoutGrid } from "lucide-react";

export function FloatingActionBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2">
      <div className="mx-auto grid w-full max-w-[1440px] gap-3 rounded-2xl border border-foreground/10 bg-background/95 p-3 shadow-2xl backdrop-blur-sm sm:grid-cols-2">
        <a
          href="#custom-requirement"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-foreground/25 bg-background px-6 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-secondary sm:text-base"
        >
          <ScanLine className="h-5 w-5 shrink-0" aria-hidden="true" />
          Send custom Requirement
        </a>
        <a
          href="#ai-recommendation"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90 sm:text-base"
        >
          <LayoutGrid className="h-5 w-5 shrink-0" aria-hidden="true" />
          AI Recommendation
        </a>
      </div>
    </div>
  );
}
