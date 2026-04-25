import { cn } from "@/lib/utils";
import type { Verdict } from "@/types/sniper";

const STYLES: Record<Verdict, string> = {
  "A+": "bg-gradient-to-br from-accent-2 to-accent text-[#1a1208] border-accent/60",
  A: "bg-buy/15 text-buy border-buy/50",
  B: "bg-info/15 text-info border-info/50",
  C: "bg-mute/15 text-mute border-mute/50",
};

export function VerdictBadge({ verdict, large = false }: { verdict: Verdict; large?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded border font-mono font-bold tracking-tight",
        large ? "h-10 w-12 text-lg" : "h-6 px-2 text-xs",
        STYLES[verdict],
      )}
    >
      {verdict}
    </span>
  );
}
