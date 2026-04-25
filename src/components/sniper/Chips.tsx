import { cn } from "@/lib/utils";
import type { FreshnessState } from "@/types/sniper";

export function SyncChip({ state, label = "BACKEND" }: { state: FreshnessState; label?: string }) {
  const map: Record<FreshnessState, { dot: string; text: string; word: string }> = {
    live: { dot: "pulse-dot", text: "text-buy", word: "LIVE" },
    "pending-sync": { dot: "pulse-dot warn", text: "text-info", word: "SYNC" },
    stale: { dot: "pulse-dot warn", text: "text-warn", word: "STALE" },
    mock: { dot: "pulse-dot warn", text: "text-violet", word: "MOCK" },
    blocked: { dot: "pulse-dot sell", text: "text-sell", word: "BLOCK" },
    offline: { dot: "pulse-dot sell", text: "text-sell", word: "OFFLINE" },
    unavailable: { dot: "pulse-dot sell", text: "text-mute", word: "N/A" },
  };
  const s = map[state];
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-bd bg-bg2/60 px-2.5 py-1.5">
      <span className={s.dot} />
      <span className="text-[10px] font-semibold tracking-wider text-mute">{label}</span>
      <span className={cn("text-[11px] font-semibold tracking-wider font-mono", s.text)}>{s.word}</span>
    </div>
  );
}

export function SignalStatusChip({
  ready,
  armed,
  watch,
}: {
  ready: number;
  armed: number;
  watch: number;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-md border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-[11px]">
      <span className="flex items-center gap-1">
        <span className="text-mute">RDY</span>
        <span className="text-buy font-semibold">{ready}</span>
      </span>
      <span className="text-bd">·</span>
      <span className="flex items-center gap-1">
        <span className="text-mute">ARM</span>
        <span className="text-warn font-semibold">{armed}</span>
      </span>
      <span className="text-bd">·</span>
      <span className="flex items-center gap-1">
        <span className="text-mute">WTC</span>
        <span className="text-info font-semibold">{watch}</span>
      </span>
    </div>
  );
}
