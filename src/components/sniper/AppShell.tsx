import { Link, Outlet, useRouterState, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useSnapshot,
  useLiveSignals,
  useEngineHealth,
  useSession,
  useUserSettings,
  usePollMs,
  useCanonicalWatchlist,
  alignWatchlistItems,
} from "@/hooks/useSniperData";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { useStreamingTicks } from "@/hooks/useStreamingTicks";
import { fmtPrice, fmtPct } from "@/lib/format";
import { tickMotionHoldMs, tickMotionStyle, type TickMotionOptions } from "@/lib/tickMotion";
import { SyncChip, SignalStatusChip } from "@/components/sniper/Chips";
import { cn, deduplicateById } from "@/lib/utils";
import type { PairPrice } from "@/types/sniper";
import {
  Activity,
  BarChart3,
  Briefcase,
  Crosshair,
  LineChart,
  ListChecks,
  LogOut,
  Radar,
  Settings,
  Target,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { clearCredentials } from "@/lib/auth";
import { APP_VERSION_LABEL } from "@/lib/version";

const NAV = [
  { to: "/plan", label: "Plan", short: "Plan", icon: Target },
  { to: "/live", label: "Live Radar", short: "Live", icon: Radar },
  { to: "/signals", label: "Signal Engine", short: "Sigs", icon: Crosshair },
  { to: "/charts", label: "Charts", short: "Chart", icon: LineChart },
  { to: "/book", label: "Active Book", short: "Book", icon: Briefcase },
  { to: "/orders", label: "Pending Orders", short: "Ord", icon: ListChecks },
  { to: "/analytics", label: "Analytics", short: "Anly", icon: BarChart3 },
  { to: "/progress", label: "Progress", short: "Prog", icon: TrendingUp },
  { to: "/account", label: "Account", short: "Acct", icon: Settings },
] as const;

const HEADER_TICK_MOTION: TickMotionOptions = {
  baseDurationMs: 220,
  durationSpreadMs: 120,
  delayMaxMs: 110,
  dotBaseDurationMs: 180,
  dotDurationSpreadMs: 110,
  dotDelayMaxMs: 90,
};

function HeaderTickerItem({ price, pollMs }: { price: PairPrice; pollMs: number }) {
  const flashHoldMs = tickMotionHoldMs(HEADER_TICK_MOTION);
  const {
    value: animatedMid,
    direction: midDir,
    heldDirection: heldMidDir,
    motionKey: midMotionKey,
    motionImpulse: midMotionImpulse,
  } = useStreamingTicks(price.mid, pollMs, flashHoldMs);
  const { value: animatedChange } = useAnimatedNumber(price.changePct1d, 100);
  const motionStyle = tickMotionStyle(`${price.symbol}:header-mid`, HEADER_TICK_MOTION, {
    motionKey: midMotionKey,
    motionImpulse: midMotionImpulse,
  });

  return (
    <div
      style={motionStyle}
      className="flex items-center gap-2 whitespace-nowrap font-mono text-xs"
    >
      <span
        className={cn(
          "header-tick-dot",
          heldMidDir === "up" && "header-tick-dot-hold-up",
          heldMidDir === "down" && "header-tick-dot-hold-down",
          midDir === "up" && "header-tick-dot-up",
          midDir === "down" && "header-tick-dot-down",
        )}
      />
      <span className="text-mute">{price.symbol}</span>
      <span
        className={cn(
          "text-tx rounded px-1 -mx-1 tabular-nums price-smooth",
          heldMidDir === "up" && "tick-hold-up",
          heldMidDir === "down" && "tick-hold-down",
          midDir === "up" && "tick-flash-up-fast",
          midDir === "down" && "tick-flash-down-fast",
        )}
      >
        {fmtPrice(animatedMid ?? price.mid, price.symbol)}
      </span>
      <span
        className={cn(
          "rounded px-1 -mx-1 tabular-nums price-smooth",
          price.changePct1d >= 0 ? "text-buy" : "text-sell",
        )}
      >
        {fmtPct(animatedChange ?? price.changePct1d)}
      </span>
    </div>
  );
}

function HeaderTicker() {
  const { data } = useSnapshot();
  const pollMs = usePollMs() ?? 2000;
  const { watchlist } = useCanonicalWatchlist();
  // Render every watchlist symbol — keep a placeholder when backend snapshot
  // hasn't emitted data yet so newly-added symbols persist visually instead of
  // flickering off when sparse snapshots arrive.
  const aligned = alignWatchlistItems(data?.prices, watchlist);
  // Duplicate for seamless loop
  const loop = [...aligned, ...aligned];
  return (
    <div className="relative flex-1 overflow-hidden border-y border-bd bg-bg2/40">
      <div className="ticker-track flex w-max items-center gap-6 py-2 px-4">
        {loop.map((entry, i) =>
          entry.item &&
          entry.item.mid > 0 &&
          (entry.item.state === "live" || entry.item.state === "mock") ? (
            <HeaderTickerItem key={`${entry.symbol}-${i}`} price={entry.item} pollMs={pollMs} />
          ) : (
            <div
              key={`${entry.symbol}-${i}-pending`}
              className="flex items-center gap-2 whitespace-nowrap font-mono text-xs opacity-60"
            >
              <span className="header-tick-dot" />
              <span className="text-mute">{entry.symbol}</span>
              <span className="text-dim tabular-nums">—</span>
              <span className="text-mute text-[10px]">awaiting</span>
            </div>
          ),
        )}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-bg to-transparent" />
    </div>
  );
}

function HeaderChips() {
  const qc = useQueryClient();
  const { data: snap } = useSnapshot();
  const { data: signals } = useLiveSignals();
  const { data: health } = useEngineHealth();
  const { data: session } = useSession();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const syncState = health?.backendSync ?? snap?.prices?.[0]?.state ?? "offline";
  const counts = useMemo(() => {
    const unique = deduplicateById(signals ?? []);
    return {
      ready: unique.filter((s) => s.status === "READY").length,
      armed: unique.filter((s) => s.status === "ARMED").length,
      watch: unique.filter((s) => s.status === "WATCH").length,
    };
  }, [signals]);

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await qc.refetchQueries({ type: "active" });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {session?.name && (
        <span className="hidden sm:inline-flex items-center rounded border border-bd bg-bg2/60 px-2 py-0.5 text-[10px] font-mono text-dim">
          {session.name}
        </span>
      )}
      <SyncChip state={syncState} />
      <SignalStatusChip {...counts} />
      <button
        onClick={() => void handleRefresh()}
        disabled={isRefreshing}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-bd bg-bg2/60 text-mute hover:text-tx hover:border-bd2 transition-colors disabled:opacity-50"
        aria-label="Refresh"
      >
        <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
      </button>
    </div>
  );
}

function BrandMark() {
  return (
    <Link to="/plan" className="flex items-center gap-2.5 shrink-0">
      <div className="brand-mark flex h-8 w-8 items-center justify-center rounded-md">
        <Activity className="h-4 w-4 text-[#1a1208]" strokeWidth={2.5} />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight text-tx">SMC SuperFIB</span>
        <span className="text-[10px] tracking-[0.18em] text-mute font-mono">
          {APP_VERSION_LABEL}
        </span>
      </div>
    </Link>
  );
}

function LeftRail() {
  const router = useRouter();
  const qc = useQueryClient();

  function handleLogout() {
    clearCredentials();
    qc.clear();
    router.navigate({ to: "/login" });
  }

  return (
    <aside className="hidden lg:flex w-52 shrink-0 flex-col border-r border-bd bg-bg1/40 sticky top-0 h-screen">
      <div className="px-4 pt-4 pb-3 border-b border-bd">
        <BrandMark />
      </div>
      <nav className="flex flex-col gap-0.5 p-2 overflow-y-auto">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm text-dim hover:bg-bg2/60 hover:text-tx transition-colors"
            activeProps={{
              className:
                "bg-bg2 text-tx border-l-2 border-accent shadow-[inset_0_0_0_1px_rgba(216,163,93,0.1)]",
            }}
          >
            <item.icon className="h-4 w-4 text-mute group-hover:text-tx" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto p-3 border-t border-bd space-y-2">
        <div className="text-[10px] font-mono text-mute leading-relaxed">
          SMC SuperFIB {APP_VERSION_LABEL}
          <br />
          Backend = source of truth
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-mute hover:text-sell hover:bg-sell/10 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function BottomNav() {
  const { location } = useRouterState();
  return (
    <nav className="lg:hidden sticky bottom-0 z-30 grid grid-cols-9 border-t border-bd bg-bg/95 backdrop-blur">
      {NAV.map((item) => {
        const active = location.pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 text-[9px] font-mono uppercase tracking-wider transition-colors",
              active ? "text-accent" : "text-mute hover:text-dim",
            )}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-bd bg-bg/85 backdrop-blur">
      <div className="flex items-stretch gap-3 px-3 py-2 lg:px-4">
        <div className="lg:hidden">
          <BrandMark />
        </div>
        <HeaderTicker />
        <div className="hidden md:flex items-center">
          <HeaderChips />
        </div>
      </div>
      <div className="flex md:hidden items-center justify-end gap-2 px-3 pb-2">
        <HeaderChips />
      </div>
    </header>
  );
}

export function AppShell() {
  useUserSettings();

  return (
    <div className="flex min-h-screen">
      <LeftRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 px-3 py-4 lg:px-6 lg:py-6 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
        <BottomNav />
      </div>
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: "#102033",
            border: "1px solid rgba(164,191,223,0.34)",
            color: "#fff",
          },
        }}
      />
    </div>
  );
}
