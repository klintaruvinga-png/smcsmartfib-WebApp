import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

export function WarningLine({
  level = "warn",
  children,
  className,
}: {
  level?: "warn" | "block" | "watch";
  children: React.ReactNode;
  className?: string;
}) {
  const isWatch = level === "watch";

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded border px-2.5 py-1.5 text-xs",
        level === "warn"
          ? "border-warn/40 bg-warn/10 text-warn"
          : isWatch
            ? "border-info/40 bg-info/10 text-info"
            : "border-sell/50 bg-sell/10 text-sell",
        className,
      )}
    >
      {isWatch ? (
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <span aria-hidden>⚠️</span>
      )}
      <span className="leading-tight">{children}</span>
    </div>
  );
}

export function DivergenceBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-sell/60 bg-sell/10 px-3 py-2 text-sm text-sell">
      <span className="mt-0.5">⚠️</span>
      <div>
        <div className="font-semibold tracking-wide">FRONTEND / BACKEND DIVERGENCE</div>
        <div className="text-sell/80 text-xs leading-snug">{children}</div>
      </div>
    </div>
  );
}
