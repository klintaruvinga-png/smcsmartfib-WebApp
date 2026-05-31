import {
  useSnapshot,
  useEngineBatch,
  usePollMs,
  useCanonicalWatchlist,
  alignWatchlistItems,
  usePollingUiState,
} from "@/hooks/useSniperData";
import { useStreamingTicks } from "@/hooks/useStreamingTicks";
import { useTickFlash } from "@/hooks/useTickFlash";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { BiasBadge, GateBadge, AnchorChopBadge, AnchorPositionMeter } from "@/components/sniper/Indicators";
import { SettingsQueryErrorState } from "@/components/sniper/SettingsQueryErrorState";
import { WarningLine } from "@/components/sniper/Warnings";
import { fmtPrice, fmtPct, relTime } from "@/lib/format";
import { MOCK_MODE } from "@/lib/api/sniperClient";
import { tickMotionHoldMs, tickMotionStyle } from "@/lib/tickMotion";
import { cn } from "@/lib/utils";
import { shouldRenderPendingCard } from "./-live.utils";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import type {
  EngineBlocker,
  PairPrice,
  RegimeState,
  GateState,
  SymbolDiagnostic,
  FreshnessState,
} from "@/types/sniper";

function blockerWarning(blocker: EngineBlocker | undefined): string | null {
  if (!blocker || blocker === "OK") return null;
  const map: Partial<Record<EngineBlocker, string>> = {
    KEY_MISSING: "Twelve Data key not set",
    KEY_INVALID: "Twelve Data key invalid",
    RATE_LIMITED: "Feed rate-limited - cooling down",
    QUOTE_UNAVAILABLE: "Price unavailable",
    PRICE_STALE: "Price data stale",
    PRICE_NOT_MT5_FRESH: "No fresh MT5 price",
    CLOSED_SESSION: "Equity index regular session closed",
    CANDLES_MISSING: "No candle history",
    CANDLES_STALE: "Candles stale (>2 h old)",
    INSUFFICIENT_CANDLE_HISTORY: "Insufficient candle history (<30 bars)",
    READY_NOT_CONFIRMED_STALE_DATA: "READY but stale data - confirmation blocked",
    ANCHOR_CHOP_BLOCKED: "Gate blocked - SF+AF dual equilibrium zone",
    AOV_EQUILIBRIUM_ZONE: "Gate blocked - HTF authority equilibrium",
    FUNDAMENTAL_HTF_OPPOSED: "Gate blocked - HTF fundamentals oppose signal bias",
  };
  return map[blocker] ?? blocker.replace(/_/g, " ").toLowerCase();
}

export function LivePage() {
  const { data, isLoading } = useSnapshot();
  const {
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    retrySettingsLoad,
  } = usePollingUiState();
  const pollMs = usePollMs() ?? 2000;
  const { mutate: runBatch, isPending: batchRunning } = useEngineBatch();
  const { watchlist } = useCanonicalWatchlist();
  if (pendingSettingsLoad || isLoading) {
    return <div className="text-mute text-sm">Loading radar...</div>;
  }
  if (settingsLoadFailed) {
    return (
      <SettingsQueryErrorState
        resourceLabel="live radar"
        errorDetail={settingsLoadError}
        onRetry={retrySettingsLoad}
      />
    );
  }
  if (missingBackendUrl) {
    return (
      <div className="text-mute text-sm">
        Configure a backend URL in Account before loading live radar.
      </div>
    );
  }
  if (!data) return <div className="text-mute text-sm">Awaiting backend radar snapshot...</div>;

  // Render every watchlist symbol. Placeholder cards for missing snapshot rows
  // prevent 4->2->3 flicker and keep newly-added symbols visible immediately.
  const aligned = alignWatchlistItems(data.prices, watchlist);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Live Radar</h1>
          <p className="text-xs text-mute mt-0.5">Prices / Regime / Gate / Anchor</p>
        </div>
        <button
          onClick={() => runBatch(undefined)}
          disabled={batchRunning}
          className="flex items-center gap-1.5 rounded border border-bd bg-bg2/60 px-3 py-1.5 text-[11px] font-mono text-dim hover:text-fg hover:border-info/40 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn("h-3 w-3", batchRunning && "animate-spin")} />
          {batchRunning ? "Refreshing..." : "Force refresh"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {aligned.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-mute">
            No watchlist symbols. Add symbols in Account to populate Live Radar.
          </div>
        )}

        {aligned.map(({ symbol, item: price }) => {
          const showPending = shouldRenderPendingCard(price, MOCK_MODE);
          if (showPending) {
            return <PendingCard key={symbol} symbol={symbol} />;
          }
          const regime = data.regimes.find((r) => r.symbol === price!.symbol);
          const gate = data.gates.find((g) => g.symbol === price!.symbol);
          const diagnostic = (data.diagnostics ?? []).find((d) => d.symbol === price!.symbol);
          return (
            <PriceCard
              key={price!.symbol}
              price={price!}
              regime={regime}
              gate={gate}
              diagnostic={diagnostic}
              pollMs={pollMs}
            />
          );
        })}
      </div>
    </div>
  );
}

function PendingCard({ symbol }: { symbol: string }) {
  return (
    <div className="rounded-lg border border-bd bg-bg1/40 p-3.5 space-y-3 opacity-70">
      <div className="flex items-center justify-between">
        <div className="font-mono text-base font-semibold">{symbol}</div>
        <span className="text-[10px] font-mono uppercase text-mute border border-bd rounded px-1.5 py-0.5">
          awaiting
        </span>
      </div>
      <div className="font-mono text-2xl font-semibold tabular-nums text-dim">--</div>
      <div className="text-[10px] font-mono text-mute">Waiting for backend snapshot...</div>
    </div>
  );
}

function PriceCard({
  price,
  regime,
  gate,
  diagnostic,
  pollMs,
}: {
  price: PairPrice;
  regime: RegimeState | undefined;
  gate: GateState | undefined;
  diagnostic: SymbolDiagnostic | undefined;
  pollMs: number;
}) {
  const chopTickStyle = tickMotionStyle(`${price.symbol}:chop`, {
    baseDurationMs: 300,
    durationSpreadMs: 100,
    delayMaxMs: 80,
  });
  const midFlashHoldMs = tickMotionHoldMs({
    baseDurationMs: 330,
    durationSpreadMs: 120,
    delayMaxMs: 90,
  });
  const bidFlashHoldMs = tickMotionHoldMs({
    baseDurationMs: 280,
    durationSpreadMs: 110,
    delayMaxMs: 120,
  });
  const askFlashHoldMs = tickMotionHoldMs({
    baseDurationMs: 290,
    durationSpreadMs: 130,
    delayMaxMs: 110,
  });
  const {
    value: animatedMid,
    direction: midDir,
    heldDirection: heldMidDir,
    motionKey: midMotionKey,
    motionImpulse: midMotionImpulse,
  } = useStreamingTicks(price.mid, pollMs, midFlashHoldMs);
  const {
    value: animatedBid,
    direction: bidDir,
    heldDirection: heldBidDir,
    motionKey: bidMotionKey,
    motionImpulse: bidMotionImpulse,
  } = useStreamingTicks(price.bid, pollMs, bidFlashHoldMs);
  const {
    value: animatedAsk,
    direction: askDir,
    heldDirection: heldAskDir,
    motionKey: askMotionKey,
    motionImpulse: askMotionImpulse,
  } = useStreamingTicks(price.ask, pollMs, askFlashHoldMs);
  const chopFlash = useTickFlash(regime?.chop);
  const midTickStyle = tickMotionStyle(
    `${price.symbol}:mid`,
    {
      baseDurationMs: 330,
      durationSpreadMs: 120,
      delayMaxMs: 90,
    },
    { motionKey: midMotionKey, motionImpulse: midMotionImpulse },
  );
  const bidTickStyle = tickMotionStyle(
    `${price.symbol}:bid`,
    {
      baseDurationMs: 280,
      durationSpreadMs: 110,
      delayMaxMs: 120,
    },
    { motionKey: bidMotionKey, motionImpulse: bidMotionImpulse },
  );
  const askTickStyle = tickMotionStyle(
    `${price.symbol}:ask`,
    {
      baseDurationMs: 290,
      durationSpreadMs: 130,
      delayMaxMs: 110,
    },
    { motionKey: askMotionKey, motionImpulse: askMotionImpulse },
  );

  // Preserve backend freshness authority. Do not reclassify cards from browser-clock math.
  const displayState: FreshnessState =
    diagnostic?.priceState === "closed_session" ||
    regime?.state === "closed_session" ||
    gate?.state === "closed_session"
      ? "closed_session"
      : price.state;
  const stale = displayState === "stale" || regime?.state === "stale";
  const closedSession = displayState === "closed_session";
  const priceUnavailable =
    price.mid === 0 && (displayState === "unavailable" || gate?.allow === "BLOCKED");
  const diagWarning = blockerWarning(diagnostic?.engineBlocker);
  const diagLevel =
    diagnostic?.engineBlocker === "KEY_MISSING" ||
    diagnostic?.engineBlocker === "KEY_INVALID" ||
    diagnostic?.engineBlocker === "RATE_LIMITED"
      ? "block"
      : "warn";
  const staleTimestamp = diagnostic?.lastPriceAt ?? price.updatedAt;
  const restTickDir = heldMidDir;
  const canAnimateTicks = displayState === "live" || displayState === "mock";
  const canHoldTheme =
    canAnimateTicks && !priceUnavailable && !stale && !closedSession && gate?.allow !== "BLOCKED";

  useEffect(() => {
    if (diagnostic?.engineBlocker === "RATE_LIMITED") {
      console.warn(`[PHASE0_SOAK] Live Radar: ${price.symbol} blocked by RATE_LIMITED`, {
        diagnostic,
        price,
        regime,
        gate,
      });
    }
  }, [diagnostic, gate, price, price.symbol, regime]);

  return (
    <div
      className={cn(
        "rounded-lg border bg-bg1/60 p-3.5 space-y-3 transition-colors",
        displayState === "unavailable" || gate?.allow === "BLOCKED"
          ? "border-sell/30"
          : closedSession
            ? "border-info/30"
            : stale
              ? "border-warn/30"
              : "border-bd",
        canHoldTheme && restTickDir === "up" && "tick-surface-hold-up",
        canHoldTheme && restTickDir === "down" && "tick-surface-hold-down",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-base font-semibold">{price.symbol}</div>
        <FreshnessBadge state={displayState} />
      </div>

      <div className="flex items-baseline justify-between">
        <div
          style={midTickStyle}
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums rounded px-1 -mx-1 price-smooth",
            canAnimateTicks && heldMidDir === "up" && "tick-hold-up",
            canAnimateTicks && heldMidDir === "down" && "tick-hold-down",
            canAnimateTicks && midDir === "up" && "tick-flash-up",
            canAnimateTicks && midDir === "down" && "tick-flash-down",
          )}
        >
          {priceUnavailable ? "--" : fmtPrice(animatedMid ?? price.mid, price.symbol)}
        </div>
        <div className={cn("font-mono text-sm", price.changePct1d >= 0 ? "text-buy" : "text-sell")}>
          {priceUnavailable ? "--" : fmtPct(price.changePct1d)}
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-mute">
        <span
          style={bidTickStyle}
          className={cn(
            "font-mono tabular-nums rounded px-1 -mx-1 price-smooth",
            canAnimateTicks && heldBidDir === "up" && "tick-hold-up",
            canAnimateTicks && heldBidDir === "down" && "tick-hold-down",
            canAnimateTicks && bidDir === "up" && "tick-flash-up-fast",
            canAnimateTicks && bidDir === "down" && "tick-flash-down-fast",
          )}
        >
          BID {priceUnavailable ? "--" : fmtPrice(animatedBid ?? price.bid, price.symbol)}
        </span>
        <span
          style={askTickStyle}
          className={cn(
            "font-mono tabular-nums rounded px-1 -mx-1 price-smooth",
            canAnimateTicks && heldAskDir === "up" && "tick-hold-up",
            canAnimateTicks && heldAskDir === "down" && "tick-hold-down",
            canAnimateTicks && askDir === "up" && "tick-flash-up-fast",
            canAnimateTicks && askDir === "down" && "tick-flash-down-fast",
          )}
        >
          ASK {priceUnavailable ? "--" : fmtPrice(animatedAsk ?? price.ask, price.symbol)}
        </span>
      </div>

      <div className="border-t border-bd pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-mute">Regime</span>
          {regime && <BiasBadge bias={regime.bias} />}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-mute">Gate</span>
          {gate && <GateBadge allow={gate.allow} />}
        </div>
        {regime && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-mute">Anchor</span>
              <AnchorChopBadge source={regime.anchorChop ?? "none"} />
            </div>
            <AnchorPositionMeter label="SF" pct={regime.sfPosition ?? null} />
            <AnchorPositionMeter label="AF" pct={regime.afPosition ?? null} />
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-mute">Nearest Fib</span>
              <span
                style={chopTickStyle}
                className={cn(
                  "text-[10px] font-mono text-dim rounded px-1 -mx-1",
                  chopFlash === "up" && "tick-flash-up",
                  chopFlash === "down" && "tick-flash-down",
                )}
              >
                {regime.nearestFib ? fmtPrice(regime.nearestFib, price.symbol) : "--"}
              </span>
            </div>
          </div>
        )}
      </div>

      {gate?.reason && <WarningLine level="block">Gate blocked: {gate.reason}</WarningLine>}
      {diagWarning && !gate?.reason && <WarningLine level={diagLevel}>{diagWarning}</WarningLine>}
      {stale && !gate?.reason && !diagWarning && (
        <WarningLine level="warn">
          Price data stale - last update {relTime(staleTimestamp)}.
        </WarningLine>
      )}
    </div>
  );
}
