import { createFileRoute } from "@tanstack/react-router";
import { useLiveSignals, useLadders } from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { VerdictBadge } from "@/components/sniper/VerdictBadge";
import { WarningLine, DivergenceBanner } from "@/components/sniper/Warnings";
import { fmtPrice, fmtPct, fmtUSC, fmtZAR, relTime } from "@/lib/format";
import { ArrowUpRight, ArrowDownRight, Send, Loader2, AlertTriangle, Search } from "lucide-react";
import { cn, deduplicateById } from "@/lib/utils";
import { apiClient } from "@/lib/api/sniperClient";
import { toast } from "sonner";
import { WalletOverview } from "@/components/sniper/WalletOverview";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Signal Plan — SMC SuperFIB" },
      {
        name: "description",
        content: "Top-rated signal with full ladder blueprint, risk and drawdown impact.",
      },
      { property: "og:title", content: "Signal Plan — SMC SuperFIB" },
      {
        property: "og:description",
        content: "Backend-confirmed entry ladder, SL, TP and risk allocation.",
      },
    ],
  }),
  component: PlanPage,
});

function PlanPage() {
  const { data: signals, isLoading: signalsLoading } = useLiveSignals();
  const { data: ladders, isLoading: laddersLoading } = useLadders();
  
  const VERDICT_RANK: Record<string, number> = { "A+": 4, A: 3, B: 2, C: 1 };
  const uniqueSignals = signals
    ? deduplicateById(signals).sort(
        (a, b) => (VERDICT_RANK[b.verdict] ?? 0) - (VERDICT_RANK[a.verdict] ?? 0),
      )
    : undefined;

  const top =
    uniqueSignals?.find(
      (s) => s.status === "READY" && ladders?.some((l) => l.signalId === s.id),
    ) ??
    uniqueSignals?.find((s) => ladders?.some((l) => l.signalId === s.id)) ??
    uniqueSignals?.find((s) => s.status === "READY") ??
    uniqueSignals?.[0];
  const plan = top ? (ladders?.find((l) => l.signalId === top.id) ?? null) : null;

  if (signalsLoading || laddersLoading) {
    return (
      <div className="flex items-center gap-2 text-mute text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading signal data and blueprints...
      </div>
    );
  }

  if (!top || !plan) {
    const diagnostics = {
      signalCount: uniqueSignals?.length ?? 0,
      readyCount: uniqueSignals?.filter((s) => s.status === "READY").length ?? 0,
      topSignal: top?.id,
      topSymbol: top?.symbol,
      blueprintCount: ladders?.length ?? 0,
      blueprintIds: ladders?.map((l) => l.signalId) ?? [],
    };

    return (
      <div className="space-y-5">
        <WalletOverview />
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-mute">
            <AlertTriangle className="h-4 w-4 text-warn shrink-0" />
            {top ? "No matching blueprint for this signal." : "No active signals found."}
          </div>
          {top && (
            <div className="text-xs text-dim bg-bg1/40 rounded px-3 py-2 max-w-lg space-y-1">
              <div>Signal: <span className="text-info font-mono">{top.id}</span> ({top.symbol} {top.direction})</div>
              <div>Found {diagnostics.blueprintCount} total blueprints</div>
              {diagnostics.blueprintCount === 0 && (
                <div className="flex items-center gap-1.5 text-warn">
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  Ladders endpoint returned no data — check backend connectivity
                </div>
              )}
              {diagnostics.blueprintCount > 0 && (
                <div>Ladder IDs available: {diagnostics.blueprintIds.join(", ") || "none"}</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const divergence = top.computedBy === "frontend" && !top.backendConfirmed;
  const dirIcon =
    top.direction === "LONG" ? (
      <ArrowUpRight className="h-5 w-5" />
    ) : (
      <ArrowDownRight className="h-5 w-5" />
    );

  return (
    <div className="space-y-5">
      <WalletOverview />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Signal Plan</h1>
          <p className="text-xs text-mute mt-0.5">Best-rated READY candidate · backend blueprint</p>
        </div>
        <FreshnessBadge state={plan.source === "backend-blueprint" ? "live" : "pending-sync"} />
      </div>

      {divergence && (
        <DivergenceBanner>
          Frontend computed this signal but the backend has not confirmed it. Do not execute until
          backend confirmation.
        </DivergenceBanner>
      )}

      {/* Hero candidate */}
      <div className="rounded-lg border border-bd bg-bg1/60 p-4 lg:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <VerdictBadge verdict={top.verdict} large />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-semibold">{top.symbol}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
                    top.direction === "LONG"
                      ? "border-buy/40 text-buy bg-buy/10"
                      : "border-sell/40 text-sell bg-sell/10",
                  )}
                >
                  {dirIcon}
                  {top.direction}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
                    top.status === "READY"
                      ? "border-buy/40 text-buy bg-buy/10"
                      : top.status === "ARMED"
                        ? "border-warn/40 text-warn bg-warn/10"
                        : "border-info/40 text-info bg-info/10",
                  )}
                >
                  {top.status}
                </span>
              </div>
              <div className="text-xs text-mute mt-1 font-mono">
                {top.id} · {relTime(top.createdAt)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider font-mono",
                plan.source === "backend-blueprint"
                  ? "border-buy/40 text-buy bg-buy/10"
                  : "border-violet/40 text-violet bg-violet/10",
              )}
            >
              {plan.source}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider font-mono",
                top.backendConfirmed
                  ? "border-buy/40 text-buy bg-buy/10"
                  : "border-warn/40 text-warn bg-warn/10",
              )}
            >
              {top.backendConfirmed ? "BACKEND ✓" : "UNCONFIRMED"}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {top.confluence.map((c) => (
            <span
              key={c}
              className="rounded bg-bg2 px-2 py-0.5 text-[10px] font-mono text-dim border border-bd"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Ladder + risk */}
      <div className="grid gap-3 lg:grid-cols-3">
        <PlanCard title="Entries" tone="info">
          <Row
            label="E1"
            value={fmtPrice(plan.entries.e1, top.symbol)}
            sub={`${plan.lotSize.e1.toFixed(2)} lot / SL ${fmtPrice(plan.stops?.e1 ?? plan.sl, top.symbol)}`}
          />
          <Row
            label="E2"
            value={fmtPrice(plan.entries.e2, top.symbol)}
            sub={`${plan.lotSize.e2.toFixed(2)} lot / SL ${fmtPrice(plan.stops?.e2 ?? plan.sl, top.symbol)}`}
          />
          <Row
            label="E3"
            value={fmtPrice(plan.entries.e3, top.symbol)}
            sub={`${plan.lotSize.e3.toFixed(2)} lot / SL ${fmtPrice(plan.stops?.e3 ?? plan.sl, top.symbol)}`}
          />
        </PlanCard>

        <PlanCard title="Targets" tone="buy">
          <Row
            label="TP1"
            value={fmtPrice(plan.tps.tp1, top.symbol)}
            sub={`R ${plan.rr.tp1.toFixed(2)}`}
            valueClass="text-buy"
          />
          <Row
            label="TP2"
            value={fmtPrice(plan.tps.tp2, top.symbol)}
            sub={`R ${plan.rr.tp2.toFixed(2)}`}
            valueClass="text-buy"
          />
          <Row
            label="TP3"
            value={fmtPrice(plan.tps.tp3, top.symbol)}
            sub={`R ${plan.rr.tp3.toFixed(2)}`}
            valueClass="text-buy"
          />
        </PlanCard>

        <PlanCard title="Stop & risk" tone="sell">
          <Row label="SL" value={fmtPrice(plan.sl, top.symbol)} valueClass="text-sell" />
          <Row label="Risk" value={fmtUSC(plan.riskUSC)} sub={fmtZAR(plan.riskZAR)} />
          <Row
            label="DD impact"
            value={fmtPct(plan.drawdownImpactPct)}
            sub="of equity"
            valueClass="text-warn"
          />
        </PlanCard>
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-bd bg-bg1/40 p-4">
        <div className="text-xs text-mute">
          Sending will queue all 3 ladder entries to{" "}
          <span className="font-mono text-dim">/user/execute-signals</span>.
        </div>
        <button
          onClick={async () => {
            try {
              const r = await apiClient.postExecuteSignals({ signalIds: [top.id] });
              toast.success(`Queued ${r.queued} order${r.queued > 1 ? "s" : ""} for execution`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Execution failed");
            }
          }}
          disabled={!top.backendConfirmed}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
            top.backendConfirmed
              ? "bg-buy/15 border border-buy/50 text-buy hover:bg-buy/25"
              : "bg-bg2 border border-bd text-mute cursor-not-allowed",
          )}
        >
          <Send className="h-4 w-4" />
          Send to execution
        </button>
      </div>

      {!top.backendConfirmed && (
        <WarningLine level="warn">
          Execution disabled until backend confirms this signal blueprint.
        </WarningLine>
      )}
    </div>
  );
}

function PlanCard({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "buy" | "sell" | "info";
  children: React.ReactNode;
}) {
  const accent =
    tone === "buy" ? "border-buy/30" : tone === "sell" ? "border-sell/30" : "border-info/30";
  return (
    <div className={cn("rounded-lg border bg-bg1/50 p-4", accent)}>
      <div className="text-[11px] font-mono uppercase tracking-wider text-mute mb-3">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
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
