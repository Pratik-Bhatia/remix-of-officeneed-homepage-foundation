import { ScanLine, Sparkles } from "lucide-react";

export function FloatingActionBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background">
      <div className="grid h-14 w-full grid-cols-2 divide-x divide-border">
        <a
          href="#custom-requirement"
          className="inline-flex h-full items-center justify-center gap-2 bg-background px-4 text-[14px] font-medium text-foreground transition-colors duration-200 hover:bg-secondary"
        >
          <ScanLine className="h-[14px] w-[14px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
          Send Custom Requirement
        </a>
        <a
          href="#ai-recommendation"
          className="inline-flex h-full items-center justify-center gap-2 bg-primary px-4 text-[14px] font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90"
        >
          <Sparkles className="h-[14px] w-[14px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
          AI Recommendation
        </a>
      </div>
    </div>
  );
}
