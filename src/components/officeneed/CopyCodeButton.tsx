import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

type Status = "idle" | "copied" | "failed";

/** Copies `code` and gives brief feedback, without ever changing the
 * button's size (no layout shift).
 *
 * Default: the label and a "Code copied!" message share one grid cell.
 * `inline`: the label stays visible, the trailing icon swaps to a check, and
 * the message floats just below as a small non-layout pill (used by the
 * announcement bar, where the code must stay readable and the bar is slim). */
export function CopyCodeButton({
  code,
  idleLabel,
  className,
  inline = false,
  copiedLabel = "Code copied!",
}: {
  code: string;
  idleLabel: React.ReactNode;
  className?: string;
  inline?: boolean;
  copiedLabel?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setStatus((await copyToClipboard(code)) ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2200);
  };

  if (inline) {
    return (
      <span className="relative inline-flex">
        <button
          type="button"
          onClick={onClick}
          aria-label={`Copy code ${code}`}
          className={cn("inline-flex items-center gap-2", className)}
        >
          {idleLabel}
          {status === "copied" ? (
            <Check className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
          ) : (
            <Copy className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          )}
        </button>
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "pointer-events-none absolute left-1/2 top-full z-[70] mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#171717] px-2.5 py-1 text-[11px] font-medium text-[#F4EBD0] shadow-md transition-opacity duration-150 motion-reduce:transition-none",
            status === "idle" ? "opacity-0" : "opacity-100",
          )}
        >
          {status === "copied" ? copiedLabel : status === "failed" ? `Copy failed — select the code to copy` : ""}
        </span>
      </span>
    );
  }

  const feedback = status === "copied" ? copiedLabel : status === "failed" ? `Copy failed — code: ${code}` : null;
  return (
    <button type="button" onClick={onClick} aria-label={`Copy code ${code}`} className={cn("inline-grid items-center", className)}>
      <span className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5", status !== "idle" && "invisible")}>
        {idleLabel}
        <Copy className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      </span>
      <span
        role="status"
        aria-live="polite"
        className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5", status === "idle" && "invisible")}
      >
        {status === "copied" ? <Check className="size-3.5 shrink-0" strokeWidth={2} aria-hidden /> : null}
        {feedback}
      </span>
    </button>
  );
}
