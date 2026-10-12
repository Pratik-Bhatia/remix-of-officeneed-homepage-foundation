import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { Toaster as Sonner, toast } from "sonner";

// Shared behaviour for every toast in the app (same `toast` API as before):
// errors and warnings stay on screen longer, and an identical message that
// is already showing is replaced rather than stacked as a duplicate.
type ToastFn = (message: Parameters<typeof toast.error>[0], data?: Parameters<typeof toast.error>[1]) => string | number;
const patched = toast as unknown as Record<string, ToastFn> & { __onPatched?: boolean };
if (!patched.__onPatched) {
  patched.__onPatched = true;
  const durations: Record<string, number> = { error: 7000, warning: 6000, success: 4000, info: 4500 };
  for (const type of Object.keys(durations)) {
    const original = patched[type].bind(toast);
    patched[type] = (message, data) =>
      original(message, ({
        duration: durations[type],
        ...(typeof message === "string" && !data?.id ? { id: `${type}:${message}` } : {}),
        ...data,
      }) as Parameters<typeof toast.error>[1]);
  }
}

type ToasterProps = React.ComponentProps<typeof Sonner>;

// One shared notification style for the whole site: red errors, green
// success, amber warnings, blue info -- always with an icon and text so
// colour is never the only cue.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      closeButton
      duration={4500}
      icons={{
        success: <CheckCircle2 className="h-4 w-4" aria-hidden />,
        error: <AlertCircle className="h-4 w-4" aria-hidden />,
        warning: <TriangleAlert className="h-4 w-4" aria-hidden />,
        info: <Info className="h-4 w-4" aria-hidden />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:rounded-lg group-[.toaster]:shadow-lg",
          error:
            "group-[.toaster]:!bg-destructive-soft group-[.toaster]:!text-destructive group-[.toaster]:!border-destructive/40",
          success:
            "group-[.toaster]:!bg-success-soft group-[.toaster]:!text-success group-[.toaster]:!border-success/40",
          warning:
            "group-[.toaster]:!bg-warning-soft group-[.toaster]:!text-warning group-[.toaster]:!border-warning/40",
          info: "group-[.toaster]:!bg-info-soft group-[.toaster]:!text-info group-[.toaster]:!border-info/40",
          title: "font-medium",
          description: "group-[.toast]:opacity-90",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "group-[.toast]:bg-background group-[.toast]:border-border",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
