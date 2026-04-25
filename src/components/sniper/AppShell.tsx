import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSnapshot, useLiveSignals } from "@/hooks/useSniperData";
import { fmtPrice, fmtPct } from "@/lib/format";
import { SyncChip, SignalStatusChip } from "@/components/sniper/Chips";
import { cn } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  Briefcase,
  Crosshair,
  LineChart,
  ListChecks,
  Radar,
  Settings,
  Target,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

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

function HeaderTicker() {
  const { data } = useSnapshot();
  const items = data?.prices ?? [];
  // Duplicate for seamless loop
  const loop = [...items, ...items];
  return (
    <div className="relative flex-1 overflow-hidden border-y border-bd bg-bg2/40">
      <div className="ticker-track flex w-max items-center gap-6 py-2 px-4">
        {loop.map((p, i) => (
          <div key={`${p.symbol}-${i}`} className="flex items-center gap-2 whitespace-nowrap font-mono text-xs">
            <span className="text-mute">{p.symbol}</span>
            <span className="text-tx">{fmtPrice(p.mid, p.symbol)}</span>
            <span className={cn(p.changePct1d >= 0 ? "text-buy" : "text-sell")}>
              {fmtPct(p.changePct1d)}
            </span>
          </div>
        ))}
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

  const syncState = snap?.prices?.[0]?.state ?? "offline";
  const counts = useMemo(() => {
    const r = signals ?? [];
    return {
      ready: r.filter((s) => s.status === "READY").length,
      armed: r.filter((s) => s.status === "ARMED").length,
      watch: r.filter((s) => s.status === "WATCH").length,
    };
  }, [signals]);

  return (
    <div className="flex items-center gap-2">
      <SyncChip state={syncState} />
      <SignalStatusChip {...counts} />
      <button
        onClick={() => qc.invalidateQueries()}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-bd bg-bg2/60 text-mute hover:text-tx hover:border-bd2 transition-colors"
        aria-label="Refresh"
      >
        <RefreshCw className="h-4 w-4" />
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
        <span className="text-[10px] tracking-[0.18em] text-mute font-mono">v12.0.8</span>
      </div>
    </Link>
  );
}

function LeftRail() {
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
      <div className="mt-auto p-3 border-t border-bd text-[10px] font-mono text-mute leading-relaxed">
        Sniper Webhook v9.0.1
        <br />
        Backend = source of truth
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
    </div>
  );
}
