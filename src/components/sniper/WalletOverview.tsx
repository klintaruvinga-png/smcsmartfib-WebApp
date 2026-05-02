import { cn } from "@/lib/utils";
import { useUserAccount } from "@/hooks/useSniperData";
import { fmtUSC } from "@/lib/format";
import { FreshnessBadge } from "./FreshnessBadge";

export function WalletOverview() {
  const { data: account, isLoading, error } = useUserAccount();
  
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
          <div className="text-[10px] text-mute">Loading...</div>
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

  const floating = account.equityUSC - account.balanceUSC;
  const onePctBalance = account.balanceUSC * 0.01;
  const onePctEquity = account.equityUSC * 0.01;
  const marginLevel = account.marginUsedPct > 0 ? (100 / account.marginUsedPct) * 100 : 0;
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
            value={fmtUSC(account.equityUSC)}
            valueClass="text-buy"
            sub={<span className="text-mute">1% = {onePctEquity.toFixed(2)} USC</span>}
          />
          <Cell
            label="BALANCE"
            value={fmtUSC(account.balanceUSC)}
            valueClass="text-info"
            sub={<span className="text-mute">1% = {onePctBalance.toFixed(2)} USC</span>}
          />
          <Cell
            label="FLOATING P/L"
            value={`${floating >= 0 ? "+" : ""}${floating.toFixed(2)}`}
            valueClass={floating >= 0 ? "text-buy" : "text-sell"}
            sub={<span className="text-mute">USC open exposure</span>}
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
