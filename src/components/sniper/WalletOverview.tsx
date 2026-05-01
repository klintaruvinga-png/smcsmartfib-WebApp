import { cn } from "@/lib/utils";
import { useUserAccount } from "@/hooks/useSniperData";
import { fmtUSC } from "@/lib/format";
import { FreshnessBadge } from "./FreshnessBadge";

export function WalletOverview() {
  const { data: account } = useUserAccount();
  if (!account) return null;

  const floating = account.equityUSC - account.balanceUSC;
  const onePct = account.balanceUSC * 0.01;
  const marginLevel = account.marginUsedPct > 0 ? (100 / account.marginUsedPct) * 100 : 0;
  const marginStrength = marginLevel > 1000 ? "Strong" : marginLevel > 200 ? "Healthy" : "Tight";

  // Mock comparison deltas (vs last / vs base)
  const equityVsLast = -4.9;
  const equityVsBase = -18.0;
  const balanceVsBase = -13.3;
  const floatingVsLast = -597.37;
  const marginVsLast = 13.8;

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
            value={fmtUSC(account.equityUSC).replace("USC ", "")}
            valueClass="text-buy"
            sub={
              <>
                <span className="text-mute">USC R2030 Day 17</span>{" "}
                <Delta v={equityVsLast} suffix="vs last" />{" "}
                <Delta v={equityVsBase} suffix="from base" />
              </>
            }
          />
          <Cell
            label="BALANCE"
            value={fmtUSC(account.balanceUSC).replace("USC ", "")}
            valueClass="text-info"
            sub={
              <>
                <span className="text-mute">1%={onePct.toFixed(2)} USC</span>{" "}
                <Delta v={balanceVsBase} suffix="from base" />
              </>
            }
          />
          <Cell
            label="FLOATING P/L"
            value={`${floating >= 0 ? "+" : ""}${floating.toFixed(2)}`}
            valueClass={floating >= 0 ? "text-buy" : "text-sell"}
            sub={
              <>
                <span className="text-mute">USC</span>{" "}
                <Delta v={floatingVsLast} suffix="vs last" raw />
              </>
            }
          />
          <Cell
            label="MARGIN LEVEL"
            value={`${Math.round(marginLevel)}%`}
            valueClass="text-buy"
            sub={
              <>
                <span className="text-dim">{marginStrength}</span>{" "}
                <Delta v={marginVsLast} suffix="vs last" />
              </>
            }
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
      <div className={cn("font-mono text-2xl lg:text-3xl font-bold mt-1 tabular-nums truncate", valueClass)}>
        {value}
      </div>
      <div className="mt-1 text-[10px] font-mono leading-relaxed">{sub}</div>
    </div>
  );
}

function Delta({ v, suffix, raw }: { v: number; suffix: string; raw?: boolean }) {
  const positive = v >= 0;
  return (
    <span className={positive ? "text-buy" : "text-sell"}>
      {positive ? "+" : ""}
      {raw ? v.toFixed(2) : `${v.toFixed(1)}%`} <span className="text-mute">{suffix}</span>
    </span>
  );
}
