import { cn } from "@/lib/utils";
import aiAssistantIconUrl from "@/assets/ai-assistant-icon-new.jpg";

export function AiAssistantIcon({ className }: { className?: string }) {
  return (
    <img 
      src={aiAssistantIconUrl} 
      alt="" 
      aria-hidden="true"
      className={cn("object-cover size-full pointer-events-none rounded-full", className)} 
    />
  );
}
