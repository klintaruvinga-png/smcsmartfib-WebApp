import { cn } from "@/lib/utils";

export function ChopMeter({ value }: { value: number }) {
  // value 0..1
  const pct = Math.min(1, Math.max(0, value)) * 100;
  const color = value > 0.6 ? "bg-warn" : value > 0.4 ? "bg-info" : "bg-buy";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg3">
        <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-mute w-8 text-right">{value.toFixed(2)}</span>
    </div>
  );
}

/** Shows where price sits inside an anchor range (0 = premium, 100 = discount, 50 = equilibrium). */
export function AnchorPositionMeter({ label, pct }: { label: "SF" | "AF"; pct: number | null }) {
  if (pct === null) return null;
  const clamped = Math.min(100, Math.max(0, pct));
  const inEq = clamped >= 37.5 && clamped <= 62.5;
  const color = inEq ? "bg-warn" : clamped > 62.5 ? "bg-buy" : "bg-sell";
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-mute w-5">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-bg3">
        <div className="absolute top-0 h-full bg-warn/20" style={{ left: "37.5%", width: "25%" }} />
        <div
          className={cn("absolute top-0 h-2 w-0.5 rounded-full -mt-px", color)}
          style={{ left: `${clamped}%`, transform: "translateX(-50%)" }}
        />
      </div>
      <span className="font-mono text-[10px] text-mute w-8 text-right">{clamped.toFixed(0)}%</span>
    </div>
  );
}

/** Badge showing anchor chop state: "SF+AF" (blocked) | "SF" | "AF" (caution) | "none" (clear). */
export function AnchorChopBadge({ source }: { source: "SF+AF" | "SF" | "AF" | "none" | null }) {
  if (!source || source === "none") {
    return (
      <span className="inline-flex items-center rounded border border-buy/40 bg-buy/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-buy">
        clear
      </span>
    );
  }
  if (source === "SF+AF") {
    return (
      <span className="inline-flex items-center rounded border border-sell/50 bg-sell/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-sell">
        chop {source}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded border border-warn/50 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-warn">
      caution {source}
    </span>
  );
}

export function GateBadge({ allow }: { allow: "BUY" | "SELL" | "BOTH" | "BLOCKED" }) {
  const map = {
    BUY: "border-buy/50 text-buy bg-buy/10",
    SELL: "border-sell/50 text-sell bg-sell/10",
    BOTH: "border-info/50 text-info bg-info/10",
    BLOCKED: "border-mute/50 text-mute bg-mute/10",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
        map[allow],
      )}
    >
      {allow}
    </span>
  );
}

export function BiasBadge({ bias }: { bias: "BULL" | "BEAR" | "RANGING" }) {
  const map = {
    BULL: "border-buy/40 text-buy bg-buy/10",
    BEAR: "border-sell/40 text-sell bg-sell/10",
    RANGING: "border-mute/40 text-mute bg-mute/10",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
        map[bias],
      )}
    >
      {bias}
    </span>
  );
}
