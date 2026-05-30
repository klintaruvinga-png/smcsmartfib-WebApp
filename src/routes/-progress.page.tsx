import { useUserAccount, useUserProgress, useUserRiskProfile, useAccountTelemetry } from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { fmtCurrency, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";

function toBadgeState(state: "LIVE" | "STALE" | "UNAVAILABLE") {
  if (state === "LIVE") return "live" as const;
  if (state === "STALE") return "stale" as const;
  return "unavailable" as const;
}

function StreakPanelState({ message }: { message: string }) {
  return (
    <>
      <div className="flex items-center gap-2 mt-2">
        <Flame className="h-6 w-6 text-mute" />
        <span className="font-mono text-sm font-semibold">Unavailable</span>
      </div>
      <div className="text-[11px] font-mono text-mute mt-0.5">{message}</div>
    </>
  );
}

function ProgressLoadingBlock() {
  return (
    <div className="mt-3 space-y-2 animate-pulse" aria-label="Loading progress data">
      <div className="h-5 w-20 rounded bg-bg3" />
      <div className="h-3 w-32 rounded bg-bg3" />
    </div>
  );
}

export function ProgressPage() {
  const { data: account } = useUserAccount();
  const { data: accountTelemetry } = useAccountTelemetry();
  const { data: risk } = useUserRiskProfile();
  const {
    data: progressData,
    isLoading: progressLoading,
    isError: progressError,
  } = useUserProgress();
  if (!account) return null;
  const ddCap = risk?.ddCapPct ?? 6.0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Progress</h1>
        <p className="text-xs text-mute mt-0.5">Pulse - streaks - milestones</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-bd bg-bg1/60 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-mono uppercase tracking-wider text-mute">Equity</div>
            <FreshnessBadge state={account.state} />
          </div>
          <div className="font-mono text-2xl font-semibold mt-2">{fmtCurrency(account.equityUSC, accountTelemetry?.currency)}</div>
          <div
            className={cn(
              "text-xs font-mono mt-0.5",
              account.todayPnlUSC >= 0 ? "text-buy" : "text-sell",
            )}
          >
            {fmtCurrency(account.todayPnlUSC, accountTelemetry?.currency, true)} today
          </div>
        </div>
        <div className="rounded-lg border border-bd bg-bg1/60 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-mono uppercase tracking-wider text-mute">Streak</div>
            {progressData ? (
              <FreshnessBadge state={toBadgeState(progressData.streak.state)} />
            ) : null}
          </div>
          {progressLoading ? (
            <ProgressLoadingBlock />
          ) : progressError || !progressData ? (
            <StreakPanelState message="Progress data unavailable while /user/progress is unreachable." />
          ) : progressData.streak.state === "UNAVAILABLE" ? (
            <StreakPanelState message="No engine run data found for this account yet." />
          ) : (
            <>
              <div className="flex items-center gap-2 mt-2">
                <Flame className="h-6 w-6 text-warn" />
                <span className="font-mono text-2xl font-semibold">
                  {progressData.streak.currentStreakDays}d
                </span>
              </div>
              <div className="text-[10px] font-mono text-mute mt-0.5">
                Last active {progressData.streak.lastActiveDate ?? "unknown"}
              </div>
            </>
          )}
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

      <div className="rounded-lg border border-bd bg-bg1/60 p-4">
        <div className="flex items-center justify-between border-b border-bd px-4 py-2.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-mute">Milestones</div>
          {progressData ? (
            <FreshnessBadge state={toBadgeState(progressData.milestones.state)} />
          ) : null}
        </div>
        {progressLoading ? (
          <div className="px-4 py-4">
            <ProgressLoadingBlock />
          </div>
        ) : progressError || !progressData ? (
          <div className="px-4 py-6 text-sm text-dim">
            Milestone progress is unavailable while /user/progress is unreachable.
          </div>
        ) : (
          <div className="space-y-3 px-4 py-4 text-sm">
            <MilestoneRow
              label="First heartbeat"
              complete={progressData.milestones.firstHeartbeat}
            />
            <MilestoneRow
              label="First market stream"
              complete={progressData.milestones.firstMarketStream}
            />
            <MilestoneRow
              label="First trade telemetry"
              complete={progressData.milestones.firstTradeTelemetry}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MilestoneRow({ label, complete }: { label: string; complete: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[11px] uppercase tracking-wider text-mute">{label}</span>
      <span
        className={cn(
          "rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider",
          complete ? "border-buy/40 bg-buy/15 text-buy" : "border-mute/30 bg-mute/10 text-mute",
        )}
      >
        {complete ? "Complete" : "Pending"}
      </span>
    </div>
  );
}
