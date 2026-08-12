import { ScanLine, Sparkles } from "lucide-react";

export function FloatingActionBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 w-full max-w-full border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="grid w-full grid-cols-2 divide-x divide-border">
        <a
          href="#custom-requirement"
          className="inline-flex h-14 min-w-0 items-center justify-center gap-1.5 bg-background px-2 text-center text-[12px] font-medium leading-tight text-foreground transition-colors duration-200 hover:bg-secondary sm:gap-2 sm:px-4 sm:text-[14px]"
        >
          <ScanLine className="h-[14px] w-[14px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
          <span className="truncate">Send Custom Requirement</span>
        </a>
        <a
          href="#ai-recommendation"
          className="inline-flex h-14 min-w-0 items-center justify-center gap-1.5 bg-primary px-2 text-center text-[12px] font-medium leading-tight text-primary-foreground transition-opacity duration-200 hover:opacity-90 sm:gap-2 sm:px-4 sm:text-[14px]"
        >
          <Sparkles className="h-[14px] w-[14px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
          <span className="truncate">AI Recommendation</span>
        </a>
      </div>
    </div>
  );
}
