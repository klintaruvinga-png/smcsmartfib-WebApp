import { createFileRoute } from "@tanstack/react-router";
import { useUserTrades } from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { WarningLine } from "@/components/sniper/Warnings";
import { fmtPrice, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PendingOrder } from "@/types/sniper";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Pending Orders — SMC SuperFIB" },
      { name: "description", content: "Working and queued orders grouped by symbol." },
      { property: "og:title", content: "Pending Orders — SMC SuperFIB" },
      { property: "og:description", content: "All working orders awaiting fill." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { data: trades } = useUserTrades();
  const orders = trades?.orders ?? [];

  const grouped = orders.reduce<Record<string, PendingOrder[]>>((acc, o) => {
    (acc[o.symbol] ??= []).push(o);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pending Orders</h1>
          <p className="text-xs text-mute mt-0.5">{orders.length} working</p>
        </div>
      </div>

      {Object.keys(grouped).length === 0 && <div className="text-mute text-sm">No pending orders.</div>}

      <div className="space-y-4">
        {Object.entries(grouped).map(([symbol, list]) => {
          const pending = list.some((o) => o.state === "pending-sync");
          return (
            <div key={symbol} className="rounded-lg border border-bd bg-bg1/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-bd bg-bg2/30">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold">{symbol}</span>
                  <span className="text-[10px] font-mono text-mute">{list.length} order{list.length > 1 ? "s" : ""}</span>
                </div>
                <FreshnessBadge state={pending ? "pending-sync" : list[0].state} />
              </div>
              {pending && (
                <div className="px-4 py-2 border-b border-bd">
                  <WarningLine level="warn">{symbol} has orders not yet acknowledged by backend.</WarningLine>
                </div>
              )}
              <div className="divide-y divide-bd">
                {list.map((o) => (
                  <div key={o.id} className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-xs">
                    <span
                      className={cn(
                        "col-span-2 sm:col-span-1 inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono w-fit",
                        o.direction === "LONG" ? "border-buy/40 text-buy bg-buy/10" : "border-sell/40 text-sell bg-sell/10",
                      )}
                    >
                      {o.direction}
                    </span>
                    <span className="col-span-2 sm:col-span-1 inline-flex items-center justify-center rounded border border-bd bg-bg2/60 px-1.5 py-0.5 text-[10px] font-mono w-fit text-mute">
                      {o.type}
                    </span>
                    <div className="col-span-3 sm:col-span-2 font-mono">
                      <div className="text-[10px] text-mute">PRICE</div>
                      <div className="text-tx">{fmtPrice(o.price, o.symbol)}</div>
                    </div>
                    <div className="col-span-2 font-mono">
                      <div className="text-[10px] text-mute">LOTS</div>
                      <div className="text-dim">{o.lots.toFixed(2)}</div>
                    </div>
                    <div className="col-span-3 sm:col-span-2 font-mono">
                      <div className="text-[10px] text-mute">SL / TP</div>
                      <div className="text-dim">
                        <span className="text-sell">{fmtPrice(o.sl, o.symbol)}</span>
                        {" / "}
                        <span className="text-buy">{fmtPrice(o.tp, o.symbol)}</span>
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-4 text-right text-[10px] font-mono text-mute">
                      placed {relTime(o.placedAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
