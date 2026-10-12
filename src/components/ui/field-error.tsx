import { AlertCircle } from "lucide-react";

/** Inline, screen-reader-announced error shown under a form field. */
export function FieldError({ id, message }: { id?: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

/** Focus a field by name after a failed validation (runs after re-render). */
export function focusField(name: string) {
  if (typeof document === "undefined") return;
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[name="${name}"]`);
    el?.focus();
  }, 0);
}
