import { createFileRoute } from "@tanstack/react-router";
import { useUserAccount, useUserRiskProfile } from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { fmtUSC, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Flame } from "lucide-react";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress — SMC SuperFIB" },
      { name: "description", content: "Account pulse, milestones and trading streaks." },
      { property: "og:title", content: "Progress — SMC SuperFIB" },
      { property: "og:description", content: "Track milestones and account growth." },
    ],
  }),
  component: ProgressPage,
});

// TODO: Replace with real milestone data from backend once the /user/progress endpoint is implemented.
const MILESTONES = [
  { label: "First $1,000 profit", target: 1000, done: true },
  { label: "10 winning trades in a row", target: 10, done: true },
  { label: "Survive a 3% drawdown", target: 3, done: true },
  { label: "$5,000 monthly profit", target: 5000, done: false, progress: 0.42 },
  { label: "Reach $50,000 equity", target: 50000, done: false, progress: 0.49 },
  { label: "Trade 100 backend-confirmed signals", target: 100, done: false, progress: 0.27 },
];

function ProgressPage() {
  const { data: account } = useUserAccount();
  const { data: risk } = useUserRiskProfile();
  if (!account) return null;
  const ddCap = risk?.ddCapPct ?? 6.0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Progress</h1>
        <p className="text-xs text-mute mt-0.5">Pulse · streaks · milestones</p>
      </div>

      {/* Pulse */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-bd bg-bg1/60 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-mono uppercase tracking-wider text-mute">Equity</div>
            <FreshnessBadge state={account.state} />
          </div>
          <div className="font-mono text-2xl font-semibold mt-2">{fmtUSC(account.equityUSC)}</div>
          <div className={cn("text-xs font-mono mt-0.5", account.todayPnlUSC >= 0 ? "text-buy" : "text-sell")}>
            {fmtUSC(account.todayPnlUSC, true)} today
          </div>
        </div>
        <div className="rounded-lg border border-bd bg-bg1/60 p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-mute">Streak</div>
          {/* TODO: streak + longest values are demo placeholders until /user/progress is live. */}
          <div className="flex items-center gap-2 mt-2">
            <Flame className="h-6 w-6 text-warn" />
            <span className="font-mono text-2xl font-semibold">7</span>
            <span className="text-xs text-mute">days</span>
          </div>
          <div className="text-[10px] font-mono text-mute mt-0.5">Longest: 14 days</div>
        </div>
        <div className="rounded-lg border border-bd bg-bg1/60 p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-mute">DD remaining</div>
          <div className="font-mono text-2xl font-semibold mt-2 text-buy">
            {fmtPct(ddCap - account.drawdownPct, false)}
          </div>
          <div className="text-[10px] font-mono text-mute mt-0.5">before cap of {fmtPct(ddCap, false)}</div>
        </div>
      </div>

      {/* Milestones */}
      <div className="rounded-lg border border-bd bg-bg1/60">
        <div className="border-b border-bd px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider text-mute">
          Milestones
        </div>
        <div className="divide-y divide-bd">
          {MILESTONES.map((m) => (
            <div key={m.label} className="px-4 py-3">
              <div className="flex items-center gap-3">
                {m.done ? (
                  <CheckCircle2 className="h-4 w-4 text-buy shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-mute shrink-0" />
                )}
                <span className={cn("text-sm flex-1", m.done ? "text-tx" : "text-dim")}>{m.label}</span>
                {!m.done && m.progress != null && (
                  <span className="font-mono text-[10px] text-mute">{Math.round(m.progress * 100)}%</span>
                )}
              </div>
              {!m.done && m.progress != null && (
                <div className="mt-2 ml-7 h-1 overflow-hidden rounded-full bg-bg3">
                  <div className="h-full bg-info" style={{ width: `${m.progress * 100}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
