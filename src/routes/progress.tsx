import { createFileRoute } from "@tanstack/react-router";
import { useUserAccount, useUserRiskProfile } from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { fmtUSC, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";

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

const PROGRESS_NOT_IMPLEMENTED = true;

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
          <div
            className={cn(
              "text-xs font-mono mt-0.5",
              account.todayPnlUSC >= 0 ? "text-buy" : "text-sell",
            )}
          >
            {fmtUSC(account.todayPnlUSC, true)} today
          </div>
        </div>
        <div className="rounded-lg border border-bd bg-bg1/60 p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-mute">Streak</div>
          <div className="flex items-center gap-2 mt-2">
            <Flame className="h-6 w-6 text-warn" />
            <span className="font-mono text-sm font-semibold">Unavailable</span>
          </div>
          <div className="text-[10px] font-mono text-mute mt-0.5">
            Streak estimates are unavailable until /user/progress is implemented.
          </div>
        </div>
        <div className="rounded-lg border border-bd bg-bg1/60 p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-mute">
            DD remaining
          </div>
          <div className="font-mono text-2xl font-semibold mt-2 text-buy">
            {fmtPct(ddCap - account.drawdownPct, false)}
          </div>
          <div className="text-[10px] font-mono text-mute mt-0.5">
            before cap of {fmtPct(ddCap, false)}
          </div>
        </div>
      </div>

      {/* Milestones */}
      <div className="rounded-lg border border-bd bg-bg1/60 p-4">
        <div className="border-b border-bd px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider text-mute">
          Milestones
        </div>
        <div className="px-4 py-6 text-sm text-dim">
          Milestone progress is unavailable until the /user/progress endpoint is implemented.
        </div>
      </div>
    </div>
  );
}
