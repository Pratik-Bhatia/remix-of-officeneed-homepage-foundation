import { cn } from "@/lib/utils";
import aiAssistantIconUrl from "@/assets/officeneed-ai-assistant-exact-high-quality.svg";

export function AiAssistantIcon({ className }: { className?: string }) {
  return (
    <img 
      src={aiAssistantIconUrl} 
      alt="" 
      aria-hidden="true"
      className={cn("object-cover size-full pointer-events-none", className)} 
    />
  );
}
