import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { QUIRKY_LOADING_MESSAGES, nextRandomIndex } from "@/components/sniper/loadingMessages";

export function PlanBoardSkeleton() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMessageIndex((index) => nextRandomIndex(index, QUIRKY_LOADING_MESSAGES.length));
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, []);

  const message = QUIRKY_LOADING_MESSAGES[messageIndex];

  return (
    <div className="space-y-5">
      <WalletOverviewSkeleton />

      <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-xs font-mono tracking-wide text-accent/80">Readiness Status</span>
        </div>
        <div className="mt-1.5 space-y-0.5">
          <p className="text-xs text-mute">
            Loading backend-confirmed plans
            <span className="loading-dots" />
          </p>
          <p
            key={message}
            className="text-xs font-mono text-dim"
            style={{ animation: "fade-in 0.35s ease-out" }}
          >
            {message}
          </p>
          <p className="text-xs font-mono text-warn/80">
            Do not execute until confirmation arrives.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Signal Plans</h1>
          <p className="mt-0.5 text-xs text-mute">Syncing signal blueprints...</p>
        </div>
        <div className="flex items-center gap-2">
          {[3, 5, 10].map((size) => (
            <div
              key={size}
              className="rounded border border-bd px-2 py-1 text-xs font-mono text-mute opacity-40"
            >
              {size === 10 ? "all" : size}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {[0, 1, 2].map((index) => (
          <PlanCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

function WalletOverviewSkeleton() {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-1 rounded-sm bg-accent" />
          <h2 className="text-[11px] font-mono uppercase tracking-[0.18em] text-dim font-semibold">
            Account
          </h2>
        </div>
        <Skeleton className="h-4 w-16 bg-bg3" />
      </div>
      <div className="overflow-hidden rounded-lg border border-bd bg-bg1/60">
        <div className="grid grid-cols-2 divide-y divide-bd lg:grid-cols-4 lg:divide-x lg:divide-y-0 [&>*]:border-bd">
          {["EQUITY", "BALANCE", "FLOATING P/L", "MARGIN LEVEL"].map((label) => (
            <div key={label} className="space-y-2 px-4 py-3 lg:px-5 lg:py-4">
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-mute font-semibold">
                {label}
              </div>
              <Skeleton className="h-7 w-24 bg-bg3" />
              <Skeleton className="h-3 w-16 bg-bg3" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCardSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-bd bg-bg1/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-20 bg-bg3" />
          <Skeleton className="h-4 w-12 bg-bg3" />
        </div>
        <div className="rounded border border-bd px-2 py-0.5 text-[10px] font-mono text-mute animate-pulse">
          Syncing...
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {["ENTRY", "STOP LOSS", "TP1"].map((label) => (
          <div key={label} className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-mute">{label}</div>
            <Skeleton className="h-5 w-full bg-bg3" />
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <div className="text-[10px] font-mono uppercase tracking-wider text-mute">R:R</div>
        <Skeleton className="h-3 w-full rounded-full bg-bg3" />
      </div>
    </div>
  );
}
