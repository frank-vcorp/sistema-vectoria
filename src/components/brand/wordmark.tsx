import { cn } from "@/lib/cn";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight text-foreground", className)}>
      <span aria-hidden="true" className="mr-1 text-primary">›</span>VectorIA
    </span>
  );
}
