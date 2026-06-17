import { cn } from "@/lib/utils";
import type { FreshnessState } from "@/types/sniper";

const STYLES: Record<FreshnessState, { label: string; cls: string }> = {
  live: { label: "LIVE", cls: "bg-buy/15 text-buy border-buy/40" },
  stale: { label: "STALE", cls: "bg-warn/15 text-warn border-warn/40" },
  unavailable: { label: "N/A", cls: "bg-mute/15 text-mute border-mute/40" },
  blocked: { label: "BLOCKED", cls: "bg-sell/15 text-sell border-sell/40" },
  offline: { label: "OFFLINE", cls: "bg-sell/15 text-sell border-sell/40" },
  "pending-sync": { label: "SYNCING", cls: "bg-info/15 text-info border-info/40" },
  closed_session: { label: "CLOSED", cls: "bg-info/15 text-info border-info/40" },
  mock: { label: "MOCK", cls: "bg-violet/15 text-violet border-violet/40" },
};

export function FreshnessBadge({
  state,
  className,
}: {
  state: FreshnessState;
  className?: string;
}) {
  // HARDENING: guard against unknown state strings (e.g. 'delayed' from MT5,
  // or a future backend value not yet in FreshnessState) so the component never
  // crashes with "Cannot read properties of undefined".
  const s = STYLES[state] ?? STYLES["stale"];
  return (
    <span
      data-testid="freshness-badge"
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
        s.cls,
        className,
      )}
    >
      {state === "live" && <span className="pulse-dot" style={{ width: 5, height: 5 }} />}
      {s.label}
    </span>
  );
}
