import { createFileRoute } from "@tanstack/react-router";
import { useUserAccount, useUserTrades, useUserRiskProfile } from "@/hooks/useSniperData";
import { mockEquityCurve } from "@/mocks/sniperData";
import { MOCK_MODE } from "@/lib/api/sniperClient";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { fmtPct, fmtUSC } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from "recharts";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — SMC SuperFIB" },
      {
        name: "description",
        content: "Equity curve, exposure, drawdown vs cap and win/loss split.",
      },
      { property: "og:title", content: "Analytics — SMC SuperFIB" },
      { property: "og:description", content: "Account performance analytics." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data: account } = useUserAccount();
  const { data: trades } = useUserTrades();
  const { data: risk } = useUserRiskProfile();

  if (!account || !risk) return null;

  const positions = trades?.positions ?? [];
  const floatingPnl = positions.reduce((s, p) => s + p.pnlUSC, 0);
  const ddRatio = account.drawdownPct / risk.ddCapPct;
  const equityCurveData = MOCK_MODE ? mockEquityCurve : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-xs text-mute mt-0.5">Equity · exposure · drawdown · split</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Equity curve */}
        <div className="rounded-lg border border-bd bg-bg1/60 p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-mute">
                Equity (30d)
              </div>
              <div className="font-mono text-2xl font-semibold mt-1">
                {fmtUSC(account.equityUSC)}
              </div>
            </div>
            <FreshnessBadge state={account.state} />
          </div>
          <div className="h-[200px] -mx-2">
            {equityCurveData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={equityCurveData}
                  margin={{ top: 5, right: 10, bottom: 5, left: 5 }}
                >
                  <defs>
                    <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#46d19a" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#46d19a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis
                    domain={["dataMin", "dataMax"]}
                    width={60}
                    tick={{ fill: "#9cb0c9", fontSize: 10, fontFamily: "JetBrains Mono" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#102033",
                      border: "1px solid rgba(164,191,223,0.34)",
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: "JetBrains Mono",
                    }}
                    labelFormatter={(l) => `Day ${l}`}
                    formatter={(v: number) => [`$${v.toFixed(2)}`, "EQUITY"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="#46d19a"
                    strokeWidth={1.5}
                    fill="url(#eq)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs font-mono text-mute">
                No historical equity data — connect backend to populate
              </div>
            )}
          </div>
        </div>

        <Stat
          label="Today P/L"
          value={fmtUSC(account.todayPnlUSC, true)}
          sub={fmtPct(account.todayPnlPct)}
          tone={account.todayPnlUSC >= 0 ? "buy" : "sell"}
          state={account.state}
        />
        <Stat
          label="Floating P/L"
          value={fmtUSC(floatingPnl, true)}
          sub={`${positions.length} positions`}
          tone={floatingPnl >= 0 ? "buy" : "sell"}
          state={account.state}
        />
        <Stat
          label="Margin used"
          value={fmtPct(account.marginUsedPct, false)}
          sub={`${fmtUSC(account.balanceUSC)} bal`}
          tone="info"
          state={account.state}
        />

        {/* Drawdown card */}
        <div className="rounded-lg border border-bd bg-bg1/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-mute">
              Drawdown vs cap
            </div>
            <FreshnessBadge state={account.state} />
          </div>
          <div className="font-mono text-xl">
            <span
              className={cn(ddRatio > 0.7 ? "text-sell" : ddRatio > 0.4 ? "text-warn" : "text-buy")}
            >
              {fmtPct(account.drawdownPct, false)}
            </span>
            <span className="text-mute text-sm"> / {fmtPct(risk.ddCapPct, false)}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg3">
            <div
              className={cn(
                "h-full transition-all",
                ddRatio > 0.7 ? "bg-sell" : ddRatio > 0.4 ? "bg-warn" : "bg-buy",
              )}
              style={{ width: `${Math.min(100, ddRatio * 100)}%` }}
            />
          </div>
        </div>

        {/* Win/loss split — requires closed trade history from backend */}
        <div className="rounded-lg border border-bd bg-bg1/60 p-4 lg:col-span-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-mute mb-3">
            Win / loss split (30d)
          </div>
          {MOCK_MODE ? (
            <>
              <div className="flex h-3 overflow-hidden rounded-full">
                <div className="bg-buy" style={{ width: "62%" }} />
                <div className="bg-sell" style={{ width: "38%" }} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs font-mono">
                <span className="text-buy">62% wins · 31</span>
                <span className="text-sell">38% loss · 19</span>
              </div>
            </>
          ) : (
            <div className="text-xs font-mono text-mute py-2">
              — historical trade data not yet available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  state,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "buy" | "sell" | "info";
  state: import("@/types/sniper").FreshnessState;
}) {
  const toneCls = tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : "text-info";
  return (
    <div className="rounded-lg border border-bd bg-bg1/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-mono uppercase tracking-wider text-mute">{label}</div>
        <FreshnessBadge state={state} />
      </div>
      <div className={cn("font-mono text-2xl font-semibold", toneCls)}>{value}</div>
      <div className="text-[10px] font-mono text-mute mt-0.5">{sub}</div>
    </div>
  );
}
