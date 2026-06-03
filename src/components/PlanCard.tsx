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
          lot: formatLotSize(plan.lotSize.e1),
          lotBelowMinimum: !isExecutableStageLotValue(plan.lotSize.e1, planSymbol),
          stop: fmtPrice(plan.stops?.e1 ?? plan.sl, signal.symbol),
          target: formatOptionalPrice(plan.tps?.tp1, signal.symbol),
          rr: formatOptionalRatio(plan.rr?.tp1),
          status: getStageStatus({
            filled: plan.stageFills?.e1,
            lot: plan.lotSize.e1,
            minLot: minExecutableLot,
            planState: plan.state,
            planSource: plan.source,
            symbol: planSymbol,
          }),
        },
        {
          stage: "E2",
          entry: fmtPrice(plan.entries.e2, signal.symbol),
          lot: formatLotSize(plan.lotSize.e2),
          lotBelowMinimum: !isExecutableStageLotValue(plan.lotSize.e2, planSymbol),
          stop: fmtPrice(plan.stops?.e2 ?? plan.sl, signal.symbol),
          target: formatOptionalPrice(plan.tps?.tp2, signal.symbol),
          rr: formatOptionalRatio(plan.rr?.tp2),
          status: getStageStatus({
            filled: plan.stageFills?.e2,
            lot: plan.lotSize.e2,
            minLot: minExecutableLot,
            planState: plan.state,
            planSource: plan.source,
            symbol: planSymbol,
          }),
        },
        {
          stage: "E3",
          entry: fmtPrice(plan.entries.e3, signal.symbol),
          lot: formatLotSize(plan.lotSize.e3),
          lotBelowMinimum: !isExecutableStageLotValue(plan.lotSize.e3, planSymbol),
          stop: fmtPrice(plan.stops?.e3 ?? plan.sl, signal.symbol),
          target: formatOptionalPrice(plan.tps?.tp3, signal.symbol),
          rr: formatOptionalRatio(plan.rr?.tp3),
          status: getStageStatus({
            filled: plan.stageFills?.e3,
            lot: plan.lotSize.e3,
            minLot: minExecutableLot,
            planState: plan.state,
            planSource: plan.source,
            symbol: planSymbol,
          }),
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
            <>
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
                  ? "PENDING BLUEPRINT"
                  : watchBlueprint
                    ? "WATCH BLUEPRINT"
                    : plan.source === "backend-blueprint"
                      ? "CONFIRMED"
                      : plan.source}
              </MetaChip>
              {!signal.backendConfirmed && <MetaChip tone="pending">UNCONFIRMED</MetaChip>}
            </>
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
          Some stages are below the {minExecutableLot.toFixed(2)} minimum lot for {planSymbol}. The
          backend will skip those stages and queue any remaining executable legs.
        </WarningLine>
      )}

      {!executableStageLots && plan && (
        <WarningLine level="warn">
          No backend stage lots meet the {minExecutableLot.toFixed(2)} minimum lot for {planSymbol}.
          Execution blocked until the backend publishes executable sizing.
        </WarningLine>
      )}

      {plan ? (
        <div className="rounded-lg border border-bd bg-bg1/50 overflow-hidden">
          <div className="border-b border-bd bg-bg1/70 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-info/80">
                Entries
              </div>
              <div className="flex items-center gap-2">
                {plan.state && <MetaPill>{plan.state}</MetaPill>}
                {(plan.executionSource ?? plan.ladder?.e1.family) && (
                  <MetaPill>{plan.executionSource ?? plan.ladder?.e1.family}</MetaPill>
                )}
              </div>
            </div>
            <div className="mt-2 space-y-1.5">
              {entryRows!.map((row) => (
                <ExecutionStageRow key={row.stage} {...row} />
              ))}
            </div>
          </div>

          <div className="grid gap-px bg-bd/60 md:grid-cols-[1.3fr_1fr]">
            <TicketSummarySection title="Risk" tone="sell">
              <InlineMetric
                label="SL"
                value={fmtPrice(plan.sl, signal.symbol)}
                valueClass="text-sell"
              />
              <InlineMetric
                label="Risk"
                value={`${fmtCurrency(plan.riskUSC, accountTelemetry?.currency)} / ${fmtLocalCurrency(plan.riskZAR, "ZAR")}`}
              />
              <InlineMetric
                label="DD"
                value={fmtPct(plan.drawdownImpactPct)}
                valueClass="text-warn"
              />
            </TicketSummarySection>

            <TicketSummarySection title="Targets" tone="buy">
              {targetRows!.map((target) => (
                <InlineMetric
                  key={target.label}
                  label={target.label}
                  value={target.price}
                  sub={target.ratio}
                  valueClass="text-buy"
                />
              ))}
            </TicketSummarySection>
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
          Execution remains disabled until backend confirmation.
        </WarningLine>
      )}
    </section>
  );
}

function TicketSummarySection({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "buy" | "sell";
  children: ReactNode;
}) {
  const accent = tone === "buy" ? "text-buy/80" : "text-sell/80";

  return (
    <div className="bg-bg1/50 px-3 py-2.5">
      <div className={cn("mb-1.5 text-[11px] font-mono uppercase tracking-wider", accent)}>
        {title}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">{children}</div>
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

function ExecutionStageRow({
  stage,
  entry,
  lot,
  lotBelowMinimum,
  stop,
  target,
  rr,
  status,
}: {
  stage: string;
  entry: string;
  lot: string;
  lotBelowMinimum: boolean;
  stop: string;
  target: string;
  rr: string;
  status: StageStatus;
}) {
  return (
    <div className="grid gap-2 rounded border border-bd/70 bg-bg2/40 px-2.5 py-2 text-[11px] font-mono sm:grid-cols-[2.25rem_1fr_.9fr_1fr_1fr_.65fr_auto] sm:items-center">
      <div className="font-semibold text-dim">{stage}</div>
      <StageMetric label="Entry" value={entry} />
      <StageMetric label="Lot" value={lot} valueClass={lotBelowMinimum ? "text-warn" : "text-tx"} />
      <StageMetric label="SL" value={stop} valueClass="text-sell" />
      <StageMetric label="TP" value={target} valueClass="text-buy" />
      <StageMetric label="RR" value={rr} valueClass="text-info" />
      <StageStatusBadge status={status} />
    </div>
  );
}

function StageMetric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <span className="text-[9px] uppercase tracking-wider text-mute sm:hidden">{label}</span>
      <span className={cn("tabular-nums", valueClass ?? "text-tx")}>{value}</span>
    </div>
  );
}

function InlineMetric({
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
    <div className="flex items-baseline gap-1.5 font-mono">
      <span className="text-[10px] uppercase tracking-wider text-mute">{label}</span>
      <span className={cn("font-semibold tabular-nums", valueClass ?? "text-tx")}>{value}</span>
      {sub && <span className="text-[10px] text-info">{sub}</span>}
    </div>
  );
}

type StageStatus = {
  label: string;
  tone: "ready" | "pending" | "blocked" | "filled";
};

function StageStatusBadge({ status }: { status: StageStatus }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center justify-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        status.tone === "ready" && "border-buy/40 bg-buy/10 text-buy",
        status.tone === "pending" && "border-info/40 bg-info/10 text-info",
        status.tone === "blocked" && "border-warn/40 bg-warn/10 text-warn",
        status.tone === "filled" && "border-buy/50 bg-buy/20 text-buy",
      )}
    >
      {status.label}
    </span>
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getStageStatus({
  filled,
  lot,
  minLot,
  planState,
  planSource,
  symbol,
}: {
  filled?: boolean;
  lot: number | undefined;
  minLot: number;
  planState?: TradePlan["state"];
  planSource: TradePlan["source"];
  symbol?: string;
}): StageStatus {
  if (filled) {
    return { label: "Filled", tone: "filled" };
  }

  if (!isExecutableStageLotValue(lot, symbol)) {
    return { label: `Below min ${minLot.toFixed(2)}`, tone: "blocked" };
  }

  if (planState === "INVALID") {
    return { label: "Blocked", tone: "blocked" };
  }

  if (planSource === "pending-blueprint" || planSource === "watch-blueprint") {
    return { label: "Pending", tone: "pending" };
  }

  return { label: "Ready", tone: "ready" };
}

function formatLotSize(value: number | undefined) {
  if (!isFiniteNumber(value)) {
    return "--";
  }

  if (value <= 0) {
    return "--";
  }

  if (value < 0.01) {
    return `${value.toFixed(3)} lot`;
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
