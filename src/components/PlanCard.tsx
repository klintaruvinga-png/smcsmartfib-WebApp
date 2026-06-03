import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { VerdictBadge } from "@/components/sniper/VerdictBadge";
import { DivergenceBanner, WarningLine } from "@/components/sniper/Warnings";
import { fmtPct, fmtPrice, fmtCurrency, fmtLocalCurrency, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/sniperClient";
import { useAccountTelemetry } from "@/hooks/useSniperData";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, Lock, Send } from "lucide-react";
import { tickMotionHoldMs, tickMotionStyle, type TickMotionOptions } from "@/lib/tickMotion";
import type { PairPrice, SignalCandidate, TradePlan } from "@/types/sniper";
import type { ReactNode } from "react";
import {
  getMinExecutableStageLot,
  hasExecutableStageLots,
  hasSkippedStageLots,
  isExecutableStageLotValue,
} from "@/routes/-plan.utils";

const PLAN_CARD_TICK_MOTION: TickMotionOptions = {
  baseDurationMs: 280,
  durationSpreadMs: 120,
  delayMaxMs: 100,
};

export function PlanCandidateCard({
  signal,
  plan,
  price,
  planComplete,
}: {
  signal: SignalCandidate;
  plan: TradePlan | null;
  price?: PairPrice;
  planComplete: boolean;
}) {
  const priceFlashHoldMs = tickMotionHoldMs(PLAN_CARD_TICK_MOTION);
  const { value, direction, heldDirection, motionKey, motionImpulse } = useAnimatedNumber(
    price?.mid,
    300,
    priceFlashHoldMs,
    signal.symbol,
  );
  const { data: accountTelemetry } = useAccountTelemetry();
  const priceStyle = tickMotionStyle(`${signal.symbol}:plan-mid`, PLAN_CARD_TICK_MOTION, {
    motionKey,
    motionImpulse,
  });
  const priceLive = Boolean(
    price && price.mid > 0 && (price.state === "live" || price.state === "mock"),
  );
  const divergence = signal.computedBy === "frontend" && !signal.backendConfirmed;
  const executableStageLots = plan ? hasExecutableStageLots(plan) : true;
  const skippedStageLots = plan ? hasSkippedStageLots(plan) : false;
  const planSymbol = plan?.symbol ?? signal.symbol;
  const minExecutableLot = getMinExecutableStageLot(planSymbol);
  const familyPill = plan?.executionSource ?? plan?.ladder?.e1.family;
  const pendingBlueprint = plan?.source === "pending-blueprint";
  const watchBlueprint = plan?.source === "watch-blueprint";
  const canExecuteSignal =
    signal.backendConfirmed &&
    !pendingBlueprint &&
    !watchBlueprint &&
    !signal.engine?.graceHold &&
    planComplete &&
    executableStageLots;
  const entryRows = plan
    ? [
        {
          stage: "E1",
          entry: fmtPrice(plan.entries.e1, signal.symbol),
          lot: formatLotSize(plan.lotSize.e1, planSymbol),
          stop: fmtPrice(plan.stops?.e1 ?? plan.sl, signal.symbol),
          target: formatOptionalPrice(plan.tps?.tp1, signal.symbol),
          rr: formatOptionalRatio(plan.rr?.tp1),
        },
        {
          stage: "E2",
          entry: fmtPrice(plan.entries.e2, signal.symbol),
          lot: formatLotSize(plan.lotSize.e2, planSymbol),
          stop: fmtPrice(plan.stops?.e2 ?? plan.sl, signal.symbol),
          target: formatOptionalPrice(plan.tps?.tp2, signal.symbol),
          rr: formatOptionalRatio(plan.rr?.tp2),
        },
        {
          stage: "E3",
          entry: fmtPrice(plan.entries.e3, signal.symbol),
          lot: formatLotSize(plan.lotSize.e3, planSymbol),
          stop: fmtPrice(plan.stops?.e3 ?? plan.sl, signal.symbol),
          target: formatOptionalPrice(plan.tps?.tp3, signal.symbol),
          rr: formatOptionalRatio(plan.rr?.tp3),
        },
      ]
    : null;
  const targetRows = plan
    ? [
        {
          label: "TP1",
          price: formatOptionalPrice(plan.tps?.tp1, signal.symbol),
          ratio: formatOptionalRatio(plan.rr?.tp1),
        },
        {
          label: "TP2",
          price: formatOptionalPrice(plan.tps?.tp2, signal.symbol),
          ratio: formatOptionalRatio(plan.rr?.tp2),
        },
        {
          label: "TP3",
          price: formatOptionalPrice(plan.tps?.tp3, signal.symbol),
          ratio: formatOptionalRatio(plan.rr?.tp3),
        },
      ]
    : null;
  const showLadderStatus = Boolean(plan?.state || plan?.stageFills);

  return (
    <section
      data-testid="plan-candidate-card"
      className={cn(
        "rounded-lg border border-bd bg-bg1/60 p-4 lg:p-5 transition-colors space-y-4",
        priceLive && heldDirection === "up" && "tick-surface-hold-up",
        priceLive && heldDirection === "down" && "tick-surface-hold-down",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-2 min-w-0">
          {/* Primary UI tags — what the user reads at a glance */}
          <div className="flex items-center gap-2 flex-wrap">
            <VerdictBadge verdict={signal.verdict} />
            <span className="font-mono text-lg font-semibold">{signal.symbol}</span>
            <DirectionBadge direction={signal.direction} />
            <StatusBadge
              status={pendingBlueprint && signal.status === "READY" ? "ARMED" : signal.status}
            />
            {signal.lifecycleState && signal.lifecycleState !== "DISPLAY_ACTIVE" && (
              <MetaPill>{signal.lifecycleState}</MetaPill>
            )}
            <FreshnessBadge state={price?.state ?? "pending-sync"} />
            <MetaPill title={signal.id}>#{shortSignalId(signal.id)}</MetaPill>
            <span className="text-xs text-mute font-mono">{relTime(signal.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span
            style={priceLive ? priceStyle : undefined}
            className={cn(
              "rounded border border-bd px-2 py-1 text-xs font-mono font-semibold tabular-nums price-smooth",
              !price && "text-mute",
              priceLive && heldDirection === "up" && "tick-hold-up",
              priceLive && heldDirection === "down" && "tick-hold-down",
              priceLive && direction === "up" && "tick-flash-up-fast",
              priceLive && direction === "down" && "tick-flash-down-fast",
            )}
          >
            {price ? fmtPrice(value ?? price.mid, signal.symbol) : "--"}
          </span>
          {plan ? (
            <MetaChip
              tone={
                plan.source === "backend-blueprint"
                  ? "buy"
                  : pendingBlueprint
                    ? "pending"
                    : watchBlueprint
                      ? "info"
                      : "violet"
              }
            >
              {pendingBlueprint && <Lock className="h-3 w-3" />}
              {pendingBlueprint
                ? "UNCONFIRMED"
                : watchBlueprint
                  ? "WATCH BLUEPRINT"
                  : plan.source === "backend-blueprint"
                    ? "CONFIRMED"
                    : plan.source}
            </MetaChip>
          ) : (
            <MetaChip tone="neutral">NO BLUEPRINT</MetaChip>
          )}
        </div>
      </div>

      {divergence && (
        <DivergenceBanner>
          Frontend computed this signal but the backend has not confirmed it. Do not execute until
          backend confirmation.
        </DivergenceBanner>
      )}

      {pendingBlueprint && (
        <WarningLine level="warn">
          Blueprint is unconfirmed. Visible for planning only — execution remains disabled until the
          backend confirms this signal.
        </WarningLine>
      )}

      {watchBlueprint && (
        <WarningLine level="watch">
          Watch blueprint is indicative and read-only. It will be replaced when a higher-quality
          ARMED/READY or backend-confirmed blueprint is available.
        </WarningLine>
      )}

      {signal.engine?.graceHold && (
        <WarningLine level="warn">
          Price feed interrupted ({signal.engine.graceHoldReason ?? "stale_data"}). Signal held
          within grace window — execution disabled until feed recovers.
        </WarningLine>
      )}

      {!planComplete && plan && (
        <WarningLine level="warn">
          Backend plan is missing TP2/TP3 or R:R values. Full 3-stage ladder is not confirmed.
          Execution blocked until the backend publishes a complete plan.
        </WarningLine>
      )}

      {skippedStageLots && plan && (
        <WarningLine level="warn">
          Backend plan contains stage lots below {minExecutableLot.toFixed(2)}. The backend will
          skip those stages and queue any remaining executable legs.
        </WarningLine>
      )}

      {!executableStageLots && plan && (
        <WarningLine level="warn">
          No backend stage lots meet the {minExecutableLot.toFixed(2)} execution minimum. Execution
          blocked until the backend publishes executable sizing.
        </WarningLine>
      )}

      {plan ? (
        <div className="rounded-lg border border-bd bg-bg1/50 overflow-hidden">
          <div className="grid gap-px bg-bd/60 xl:grid-cols-[1.8fr_1fr_1fr_1fr]">
            <PlanPanel title="Entries" tone="info">
              <div className="overflow-x-auto -mx-3 px-3">
                <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-x-2 gap-y-2 text-[10px] font-mono min-w-[360px]">
                  <SectionHeaderCell />
                  <SectionHeaderCell>Entry</SectionHeaderCell>
                  <SectionHeaderCell>Lot</SectionHeaderCell>
                  <SectionHeaderCell>SL</SectionHeaderCell>
                  <SectionHeaderCell>TP</SectionHeaderCell>
                  <SectionHeaderCell>RR</SectionHeaderCell>
                  {entryRows!.map((row) => (
                    <EntryRow key={row.stage} {...row} />
                  ))}
                </div>
              </div>
            </PlanPanel>

            <PlanPanel title="Targets" tone="buy">
              <div className="space-y-2">
                {targetRows!.map((target) => (
                  <StatRow
                    key={target.label}
                    label={target.label}
                    value={target.price}
                    sub={target.ratio}
                    valueClass="text-buy"
                  />
                ))}
              </div>
            </PlanPanel>

            <PlanPanel title="Stop & Risk" tone="sell">
              <div className="space-y-2">
                <StatRow
                  label="SL"
                  value={fmtPrice(plan.sl, signal.symbol)}
                  valueClass="text-sell"
                />
                <StatRow
                  label="Risk"
                  value={fmtCurrency(plan.riskUSC, accountTelemetry?.currency)}
                  sub={fmtLocalCurrency(plan.riskZAR, "ZAR")}
                />
                <StatRow
                  label="DD impact"
                  value={fmtPct(plan.drawdownImpactPct)}
                  sub="of equity"
                  valueClass="text-warn"
                />
              </div>
            </PlanPanel>

            {showLadderStatus && (
              <PlanPanel title="Ladder Status" tone="neutral">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono uppercase tracking-wider text-mute">State</span>
                    <span className="font-mono text-sm font-semibold">{plan.state ?? "--"}</span>
                  </div>
                  {plan.stageFills && (
                    <div className="grid grid-cols-3 gap-2">
                      <StageStatusChip label="E1" filled={plan.stageFills.e1} />
                      <StageStatusChip label="E2" filled={plan.stageFills.e2} />
                      <StageStatusChip label="E3" filled={plan.stageFills.e3} />
                    </div>
                  )}
                </div>
              </PlanPanel>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-bd bg-bg1/40 px-3 py-3">
            <div className="text-[11px] text-mute">
              Queues this ladder to{" "}
              <span className="font-mono text-dim">/user/execute-signals</span>.
            </div>
            <button
              onClick={async () => {
                try {
                  const response = await apiClient.postExecuteSignals({ signalIds: [signal.id] });
                  toast.success(
                    `Queued ${response.queued} order${response.queued > 1 ? "s" : ""} for execution`,
                  );
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Execution failed");
                }
              }}
              disabled={!canExecuteSignal}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors w-full sm:w-auto",
                canExecuteSignal
                  ? "bg-buy/15 border border-buy/50 text-buy hover:bg-buy/25"
                  : "bg-bg2 border border-bd text-mute cursor-not-allowed",
              )}
            >
              <Send className="h-4 w-4" />
              Send to execution
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-bd bg-bg1/40 px-4 py-5 space-y-2">
          <div className="text-xs font-mono uppercase tracking-wider text-mute">
            Awaiting blueprint
          </div>
          <div className="text-sm text-dim">
            {signal.engineBlocker
              ? signal.engineBlocker
              : signal.status === "ARMED"
                ? "Signal is ARMED — blueprint generated when READY conditions are met"
                : "Signal is being monitored — no entry conditions met yet"}
          </div>
          {signal.engine && (
            <div className="flex gap-3 flex-wrap text-[11px] font-mono text-dim pt-1">
              <span>HTF: {signal.engine.htfBias}</span>
              <span>·</span>
              <span>PD: {signal.engine.pdState}</span>
              {signal.engineBlocker && signal.engineBlocker !== "OK" && (
                <>
                  <span>·</span>
                  <span className="text-warn">{signal.engineBlocker}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!signal.backendConfirmed && (
        <WarningLine level="warn">
          Execution disabled until backend confirms this signal blueprint.
        </WarningLine>
      )}
    </section>
  );
}

function PlanPanel({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "buy" | "sell" | "info" | "neutral";
  children: ReactNode;
}) {
  const accent =
    tone === "buy"
      ? "text-buy/80"
      : tone === "sell"
        ? "text-sell/80"
        : tone === "info"
          ? "text-info/80"
          : "text-mute";

  return (
    <div className="bg-bg1/50 p-3">
      <div className={cn("mb-3 text-[11px] font-mono uppercase tracking-wider", accent)}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DirectionBadge({ direction }: { direction: SignalCandidate["direction"] }) {
  const icon =
    direction === "LONG" ? (
      <ArrowUpRight className="h-4 w-4" />
    ) : (
      <ArrowDownRight className="h-4 w-4" />
    );

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
        direction === "LONG"
          ? "border-buy/40 text-buy bg-buy/10"
          : "border-sell/40 text-sell bg-sell/10",
      )}
    >
      {icon}
      {direction}
    </span>
  );
}

function StatusBadge({ status }: { status: SignalCandidate["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
        status === "READY"
          ? "border-buy/40 text-buy bg-buy/10"
          : status === "ARMED"
            ? "border-warn/40 text-warn bg-warn/10"
            : "border-info/40 text-info bg-info/10",
      )}
    >
      {status}
    </span>
  );
}

function MetaPill({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="rounded border border-bd bg-bg2 px-2 py-0.5 text-[10px] font-mono text-dim"
    >
      {children}
    </span>
  );
}

function shortSignalId(id: string): string {
  // Strip "sig-" prefix and use last 4 chars uppercased for a memorable short ID
  const stripped = id.replace(/^sig-/i, "");
  return stripped.slice(-4).toUpperCase();
}

function MetaChip({
  tone,
  children,
}: {
  tone: "buy" | "violet" | "warn" | "neutral" | "pending" | "info";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider font-mono",
        tone === "buy" && "border-buy/40 text-buy bg-buy/10",
        tone === "violet" && "border-violet/40 text-violet bg-violet/10",
        tone === "warn" && "border-warn/40 text-warn bg-warn/10",
        tone === "neutral" && "border-bd text-mute bg-bg2",
        tone === "pending" && "border-warn/40 text-warn bg-warn/10",
        tone === "info" && "border-info/40 text-info bg-info/10",
      )}
    >
      {children}
    </span>
  );
}

function SectionHeaderCell({ children }: { children?: ReactNode }) {
  return <div className="text-mute uppercase tracking-wider">{children}</div>;
}

function EntryRow({
  stage,
  entry,
  lot,
  stop,
  target,
  rr,
}: {
  stage: string;
  entry: string;
  lot: string;
  stop: string;
  target: string;
  rr: string;
}) {
  return (
    <>
      <div className="text-dim">{stage}</div>
      <div className="text-tx">{entry}</div>
      <div className="text-tx">{lot}</div>
      <div className="text-tx">{stop}</div>
      <div className="text-buy">{target}</div>
      <div className="text-info">{rr}</div>
    </>
  );
}

function StatRow({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] font-mono uppercase tracking-wider text-mute">{label}</span>
      <div className="text-right">
        <div className={cn("font-mono text-sm font-semibold", valueClass ?? "text-tx")}>
          {value}
        </div>
        {sub && <div className="text-[10px] font-mono text-mute">{sub}</div>}
      </div>
    </div>
  );
}

function StageStatusChip({ label, filled }: { label: string; filled: boolean }) {
  return (
    <div
      className={cn(
        "rounded px-2 py-1 text-center text-xs font-mono",
        filled ? "bg-buy/20 text-buy" : "bg-bg2 text-dim",
      )}
    >
      {label} {filled ? "Filled" : "Pending"}
    </div>
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatLotSize(value: number | undefined, symbol?: string) {
  if (!isFiniteNumber(value)) {
    return "--";
  }

  if (!isExecutableStageLotValue(value, symbol)) {
    return `Below ${getMinExecutableStageLot(symbol).toFixed(2)} lot`;
  }

  return `${value.toFixed(2)} lot`;
}

function formatOptionalPrice(value: number | undefined, symbol?: string) {
  return isFiniteNumber(value) ? fmtPrice(value, symbol) : "--";
}

function formatOptionalRatio(value: number | undefined) {
  if (!isFiniteNumber(value)) return "1:--";
  return Number.isInteger(value) ? `1:${value}` : `1:${value.toFixed(2)}`;
}
