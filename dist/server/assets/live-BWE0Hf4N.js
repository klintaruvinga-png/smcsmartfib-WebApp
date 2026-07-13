import { jsx, jsxs } from "react/jsx-runtime";
import { w as useSnapshot, b as usePollingUiState, z as usePollMs, c as useEngineBatch, d as useCanonicalWatchlist, C as alignWatchlistItems, f as cn, M as MOCK_MODE, t as tickMotionStyle, q as tickMotionHoldMs, E as useStreamingTicks, F as FreshnessBadge, m as fmtPrice, l as fmtPct, W as WarningLine, r as relTime } from "./router-DONb8JY3.js";
import { u as useTickFlash } from "./useTickFlash-CPIV-dXF.js";
import { B as BiasBadge, G as GateBadge, A as AnchorChopBadge, a as AnchorPositionMeter } from "./Indicators-BvwzcdKI.js";
import { S as SettingsQueryErrorState } from "./SettingsQueryErrorState-2nE1Yemg.js";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import "@tanstack/react-router";
import "@tanstack/react-query";
import "clsx";
import "tailwind-merge";
import "sonner";
import "recharts";
import "@radix-ui/react-slot";
import "class-variance-authority";
function shouldRenderPendingCard(price, mockMode) {
  if (!price) return true;
  if (mockMode) {
    return price.source !== "mock" && price.source !== "mt5";
  }
  return price.source !== "mt5";
}
function blockerWarning(blocker) {
  if (!blocker || blocker === "OK") return null;
  const map = {
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
    FUNDAMENTAL_HTF_OPPOSED: "Gate blocked - HTF fundamentals oppose signal bias"
  };
  return map[blocker] ?? blocker.replace(/_/g, " ").toLowerCase();
}
function LivePage() {
  const { data, isLoading } = useSnapshot();
  const {
    pendingSettingsLoad,
    missingBackendUrl,
    settingsLoadFailed,
    settingsLoadError,
    retrySettingsLoad
  } = usePollingUiState();
  const pollMs = usePollMs() ?? 2e3;
  const { mutate: runBatch, isPending: batchRunning } = useEngineBatch();
  const { watchlist } = useCanonicalWatchlist();
  if (pendingSettingsLoad || isLoading) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Loading radar..." });
  }
  if (settingsLoadFailed) {
    return /* @__PURE__ */ jsx(
      SettingsQueryErrorState,
      {
        resourceLabel: "live radar",
        errorDetail: settingsLoadError,
        onRetry: retrySettingsLoad
      }
    );
  }
  if (missingBackendUrl) {
    return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Configure a backend URL in Account before loading live radar." });
  }
  if (!data) return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Awaiting backend radar snapshot..." });
  const aligned = alignWatchlistItems(data.prices, watchlist);
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-end justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Live Radar" }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-mute mt-0.5", children: "Prices / Regime / Gate / Anchor" })
      ] }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => runBatch(void 0),
          disabled: batchRunning,
          className: "flex items-center gap-1.5 rounded border border-bd bg-bg2/60 px-3 py-1.5 text-[11px] font-mono text-dim hover:text-fg hover:border-info/40 disabled:opacity-50 transition-colors",
          children: [
            /* @__PURE__ */ jsx(RefreshCw, { className: cn("h-3 w-3", batchRunning && "animate-spin") }),
            batchRunning ? "Refreshing..." : "Force refresh"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", children: [
      aligned.length === 0 && /* @__PURE__ */ jsx("div", { className: "col-span-full py-10 text-center text-sm text-mute", children: "No watchlist symbols. Add symbols in Account to populate Live Radar." }),
      aligned.map(({ symbol, item: price }) => {
        const showPending = shouldRenderPendingCard(price, MOCK_MODE);
        if (showPending) {
          return /* @__PURE__ */ jsx(PendingCard, { symbol }, symbol);
        }
        const regime = data.regimes.find((r) => r.symbol === price.symbol);
        const gate = data.gates.find((g) => g.symbol === price.symbol);
        const diagnostic = (data.diagnostics ?? []).find((d) => d.symbol === price.symbol);
        return /* @__PURE__ */ jsx(
          PriceCard,
          {
            price,
            regime,
            gate,
            diagnostic,
            pollMs
          },
          price.symbol
        );
      })
    ] })
  ] });
}
function PendingCard({ symbol }) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-bd bg-bg1/40 p-3.5 space-y-3 opacity-70", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("div", { className: "font-mono text-base font-semibold", children: symbol }),
      /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono uppercase text-mute border border-bd rounded px-1.5 py-0.5", children: "awaiting" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "font-mono text-2xl font-semibold tabular-nums text-dim", children: "--" }),
    /* @__PURE__ */ jsx("div", { className: "text-[10px] font-mono text-mute", children: "Waiting for backend snapshot..." })
  ] });
}
function PriceCard({
  price,
  regime,
  gate,
  diagnostic,
  pollMs
}) {
  const chopTickStyle = tickMotionStyle(`${price.symbol}:chop`, {
    baseDurationMs: 300,
    durationSpreadMs: 100,
    delayMaxMs: 80
  });
  const midFlashHoldMs = tickMotionHoldMs({
    baseDurationMs: 330,
    durationSpreadMs: 120,
    delayMaxMs: 90
  });
  const bidFlashHoldMs = tickMotionHoldMs({
    baseDurationMs: 280,
    durationSpreadMs: 110,
    delayMaxMs: 120
  });
  const askFlashHoldMs = tickMotionHoldMs({
    baseDurationMs: 290,
    durationSpreadMs: 130,
    delayMaxMs: 110
  });
  const {
    value: animatedMid,
    direction: midDir,
    heldDirection: heldMidDir,
    motionKey: midMotionKey,
    motionImpulse: midMotionImpulse
  } = useStreamingTicks(price.mid, pollMs, midFlashHoldMs);
  const {
    value: animatedBid,
    direction: bidDir,
    heldDirection: heldBidDir,
    motionKey: bidMotionKey,
    motionImpulse: bidMotionImpulse
  } = useStreamingTicks(price.bid, pollMs, bidFlashHoldMs);
  const {
    value: animatedAsk,
    direction: askDir,
    heldDirection: heldAskDir,
    motionKey: askMotionKey,
    motionImpulse: askMotionImpulse
  } = useStreamingTicks(price.ask, pollMs, askFlashHoldMs);
  const chopFlash = useTickFlash(regime?.chop);
  const midTickStyle = tickMotionStyle(
    `${price.symbol}:mid`,
    {
      baseDurationMs: 330,
      durationSpreadMs: 120,
      delayMaxMs: 90
    },
    { motionKey: midMotionKey, motionImpulse: midMotionImpulse }
  );
  const bidTickStyle = tickMotionStyle(
    `${price.symbol}:bid`,
    {
      baseDurationMs: 280,
      durationSpreadMs: 110,
      delayMaxMs: 120
    },
    { motionKey: bidMotionKey, motionImpulse: bidMotionImpulse }
  );
  const askTickStyle = tickMotionStyle(
    `${price.symbol}:ask`,
    {
      baseDurationMs: 290,
      durationSpreadMs: 130,
      delayMaxMs: 110
    },
    { motionKey: askMotionKey, motionImpulse: askMotionImpulse }
  );
  const displayState = diagnostic?.priceState === "closed_session" || regime?.state === "closed_session" || gate?.state === "closed_session" ? "closed_session" : price.state;
  const stale = displayState === "stale" || regime?.state === "stale";
  const closedSession = displayState === "closed_session";
  const priceUnavailable = price.mid === 0 && (displayState === "unavailable" || gate?.allow === "BLOCKED");
  const diagWarning = blockerWarning(diagnostic?.engineBlocker);
  const diagLevel = diagnostic?.engineBlocker === "KEY_MISSING" || diagnostic?.engineBlocker === "KEY_INVALID" || diagnostic?.engineBlocker === "RATE_LIMITED" ? "block" : "warn";
  const staleTimestamp = diagnostic?.lastPriceAt ?? price.updatedAt;
  const restTickDir = heldMidDir;
  const canAnimateTicks = displayState === "live" || displayState === "mock";
  const canHoldTheme = canAnimateTicks && !priceUnavailable && !stale && !closedSession && gate?.allow !== "BLOCKED";
  useEffect(() => {
    if (diagnostic?.engineBlocker === "RATE_LIMITED") {
      console.warn(`[PHASE0_SOAK] Live Radar: ${price.symbol} blocked by RATE_LIMITED`, {
        diagnostic,
        price,
        regime,
        gate
      });
    }
  }, [diagnostic, gate, price, price.symbol, regime]);
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: cn(
        "rounded-lg border bg-bg1/60 p-3.5 space-y-3 transition-colors",
        displayState === "unavailable" || gate?.allow === "BLOCKED" ? "border-sell/30" : closedSession ? "border-info/30" : stale ? "border-warn/30" : "border-bd",
        canHoldTheme && restTickDir === "up" && "tick-surface-hold-up",
        canHoldTheme && restTickDir === "down" && "tick-surface-hold-down"
      ),
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("div", { className: "font-mono text-base font-semibold", children: price.symbol }),
          /* @__PURE__ */ jsx(FreshnessBadge, { state: displayState })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-baseline justify-between", children: [
          /* @__PURE__ */ jsx(
            "div",
            {
              style: midTickStyle,
              className: cn(
                "font-mono text-2xl font-semibold tabular-nums rounded px-1 -mx-1 price-smooth",
                canAnimateTicks && heldMidDir === "up" && "tick-hold-up",
                canAnimateTicks && heldMidDir === "down" && "tick-hold-down",
                canAnimateTicks && midDir === "up" && "tick-flash-up",
                canAnimateTicks && midDir === "down" && "tick-flash-down"
              ),
              children: priceUnavailable ? "--" : fmtPrice(animatedMid ?? price.mid, price.symbol)
            }
          ),
          /* @__PURE__ */ jsx("div", { className: cn("font-mono text-sm", price.changePct1d >= 0 ? "text-buy" : "text-sell"), children: priceUnavailable ? "--" : fmtPct(price.changePct1d) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between text-[10px] font-mono text-mute", children: [
          /* @__PURE__ */ jsxs(
            "span",
            {
              style: bidTickStyle,
              className: cn(
                "font-mono tabular-nums rounded px-1 -mx-1 price-smooth",
                canAnimateTicks && heldBidDir === "up" && "tick-hold-up",
                canAnimateTicks && heldBidDir === "down" && "tick-hold-down",
                canAnimateTicks && bidDir === "up" && "tick-flash-up-fast",
                canAnimateTicks && bidDir === "down" && "tick-flash-down-fast"
              ),
              children: [
                "BID ",
                priceUnavailable ? "--" : fmtPrice(animatedBid ?? price.bid, price.symbol)
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "span",
            {
              style: askTickStyle,
              className: cn(
                "font-mono tabular-nums rounded px-1 -mx-1 price-smooth",
                canAnimateTicks && heldAskDir === "up" && "tick-hold-up",
                canAnimateTicks && heldAskDir === "down" && "tick-hold-down",
                canAnimateTicks && askDir === "up" && "tick-flash-up-fast",
                canAnimateTicks && askDir === "down" && "tick-flash-down-fast"
              ),
              children: [
                "ASK ",
                priceUnavailable ? "--" : fmtPrice(animatedAsk ?? price.ask, price.symbol)
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "border-t border-bd pt-3 space-y-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono uppercase tracking-wider text-mute", children: "Regime" }),
            regime && /* @__PURE__ */ jsx(BiasBadge, { bias: regime.bias })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono uppercase tracking-wider text-mute", children: "Gate" }),
            gate && /* @__PURE__ */ jsx(GateBadge, { allow: gate.allow })
          ] }),
          regime && /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono uppercase tracking-wider text-mute", children: "Anchor" }),
              /* @__PURE__ */ jsx(AnchorChopBadge, { source: regime.anchorChop ?? "none" })
            ] }),
            /* @__PURE__ */ jsx(AnchorPositionMeter, { label: "SF", pct: regime.sfPosition ?? null }),
            /* @__PURE__ */ jsx(AnchorPositionMeter, { label: "AF", pct: regime.afPosition ?? null }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between pt-0.5", children: [
              /* @__PURE__ */ jsx("span", { className: "text-[10px] font-mono uppercase tracking-wider text-mute", children: "Nearest Fib" }),
              /* @__PURE__ */ jsx(
                "span",
                {
                  style: chopTickStyle,
                  className: cn(
                    "text-[10px] font-mono text-dim rounded px-1 -mx-1",
                    chopFlash === "up" && "tick-flash-up",
                    chopFlash === "down" && "tick-flash-down"
                  ),
                  children: regime.nearestFib ? fmtPrice(regime.nearestFib, price.symbol) : "--"
                }
              )
            ] })
          ] })
        ] }),
        gate?.reason && /* @__PURE__ */ jsxs(WarningLine, { level: "block", children: [
          "Gate blocked: ",
          gate.reason
        ] }),
        diagWarning && !gate?.reason && /* @__PURE__ */ jsx(WarningLine, { level: diagLevel, children: diagWarning }),
        stale && !gate?.reason && !diagWarning && /* @__PURE__ */ jsxs(WarningLine, { level: "warn", children: [
          "Price data stale - last update ",
          relTime(staleTimestamp),
          "."
        ] })
      ]
    }
  );
}
const SplitComponent = LivePage;
export {
  SplitComponent as component
};
