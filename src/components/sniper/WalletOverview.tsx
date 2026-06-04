import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccountTelemetry } from "@/hooks/useSniperData";
import { fmtCurrency } from "@/lib/format";
import { FreshnessBadge } from "./FreshnessBadge";

const USD_TO_ZAR_RATE = 18.5;

export function WalletOverview() {
  const { data: account, isLoading, error } = useAccountTelemetry();

  if (isLoading) {
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
            {(["EQUITY", "BALANCE", "FLOATING P/L", "MARGIN LEVEL"] as const).map((label) => (
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

  if (error || !account) {
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-1 rounded-sm bg-accent" />
            <h2 className="text-[11px] font-mono uppercase tracking-[0.18em] text-dim font-semibold">
              Account
            </h2>
          </div>
        </div>
        <div className="text-xs text-warn/80 px-4 py-3">
          ⚠️ Account data unavailable — check backend connection or authentication
        </div>
      </section>
    );
  }

  const cur = account.currency;
  const floating = account.floatingPl;
  const marginLevel = account.marginLevel > 0 ? account.marginLevel : 0;
  const marginStrength = marginLevel > 1000 ? "Strong" : marginLevel > 200 ? "Healthy" : "Tight";

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-1 rounded-sm bg-accent" />
          <h2 className="text-[11px] font-mono uppercase tracking-[0.18em] text-dim font-semibold">
            Account
          </h2>
        </div>
        <FreshnessBadge state={account.state} />
      </div>

      <div className="rounded-lg border border-bd bg-bg1/60 overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-bd divide-y lg:divide-y-0 lg:divide-x [&>*]:border-bd">
          <Cell
            label="EQUITY"
            value={fmtCurrency(account.equity, cur)}
            valueClass="text-buy"
            sub={<span className="text-mute">{formatLocalZar(account.equity, cur)}</span>}
          />
          <Cell
            label="BALANCE"
            value={fmtCurrency(account.balance, cur)}
            valueClass="text-info"
            sub={<span className="text-mute">{formatLocalZar(account.balance, cur)}</span>}
          />
          <Cell
            label="FLOATING P/L"
            value={fmtCurrency(floating, cur, true)}
            valueClass={floating >= 0 ? "text-buy" : "text-sell"}
            sub={<span className="text-mute">{formatLocalZar(floating, cur)}</span>}
          />
          <Cell
            label="MARGIN LEVEL"
            value={`${Math.round(marginLevel)}%`}
            valueClass="text-buy"
            sub={<span className="text-dim">{marginStrength}</span>}
          />
        </div>
      </div>
    </section>
  );
}

function accountCurrencyToUsd(value: number, currency?: string | null): number {
  return (currency ?? "").toUpperCase() === "USC" ? value / 100 : value;
}

function formatLocalZar(value: number, currency?: string | null): string {
  const zar = accountCurrencyToUsd(value, currency) * USD_TO_ZAR_RATE;
  return `Local ZAR ${zar.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function Cell({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="px-4 py-3 lg:px-5 lg:py-4 min-w-0">
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-mute font-semibold">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-2xl lg:text-3xl font-bold mt-1 tabular-nums truncate",
          valueClass,
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] font-mono leading-relaxed">{sub}</div>
    </div>
  );
}
