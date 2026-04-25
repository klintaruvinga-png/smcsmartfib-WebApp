import { cn } from "@/lib/utils";

export function WarningLine({
  level = "warn",
  children,
  className,
}: {
  level?: "warn" | "block";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded border px-2.5 py-1.5 text-xs",
        level === "warn"
          ? "border-warn/40 bg-warn/10 text-warn"
          : "border-sell/50 bg-sell/10 text-sell",
        className,
      )}
    >
      <span aria-hidden>⚠️</span>
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
