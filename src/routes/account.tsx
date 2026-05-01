import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useUserSettings, useUserRiskProfile } from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { WarningLine } from "@/components/sniper/Warnings";
import { cn } from "@/lib/utils";
import { Settings as SettingsIcon, Shield, KeyRound, X } from "lucide-react";
import { MOCK_MODE } from "@/lib/api/sniperClient";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account & Settings — SMC SuperFIB" },
      {
        name: "description",
        content: "Backend URL, API key status, refresh interval, watchlist and risk profile.",
      },
      { property: "og:title", content: "Account & Settings — SMC SuperFIB" },
      { property: "og:description", content: "Configure your dashboard and risk profile." },
    ],
  }),
  component: AccountPage,
});

type Tab = "settings" | "risk";

function AccountPage() {
  const [tab, setTab] = useState<Tab>("settings");
  const { data: settings } = useUserSettings();
  const { data: risk } = useUserRiskProfile();

  if (!settings || !risk) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Account &amp; Settings</h1>
        <p className="text-xs text-mute mt-0.5">Configure backend, refresh and risk allocation</p>
      </div>

      {MOCK_MODE && (
        <WarningLine level="warn">
          App running in MOCK_MODE. Real REST calls disabled — all data is synthetic.
        </WarningLine>
      )}

      <div className="flex gap-1 border-b border-bd">
        <TabButton
          active={tab === "settings"}
          onClick={() => setTab("settings")}
          icon={<SettingsIcon className="h-3.5 w-3.5" />}
        >
          Settings
        </TabButton>
        <TabButton
          active={tab === "risk"}
          onClick={() => setTab("risk")}
          icon={<Shield className="h-3.5 w-3.5" />}
        >
          Risk Profile
        </TabButton>
      </div>

      {tab === "settings" ? <SettingsTab settings={settings} /> : <RiskTab risk={risk} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium transition-colors -mb-px border-b-2",
        active ? "border-accent text-accent" : "border-transparent text-mute hover:text-dim",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function SettingsTab({ settings }: { settings: import("@/types/sniper").DashboardSettings }) {
  const [s, setS] = useState(settings);
  const [newPair, setNewPair] = useState("");

  const removePair = (p: string) => setS({ ...s, watchlist: s.watchlist.filter((w) => w !== p) });

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Backend">
        <Field label="Backend URL">
          <input
            type="url"
            value={s.backendUrl}
            onChange={(e) => setS({ ...s, backendUrl: e.target.value })}
            className="w-full rounded border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-xs text-tx focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="API key status">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-mute" />
            <span
              className={cn(
                "inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
                s.apiKeyStatus === "ok"
                  ? "border-buy/40 text-buy bg-buy/10"
                  : s.apiKeyStatus === "missing"
                    ? "border-warn/40 text-warn bg-warn/10"
                    : "border-sell/40 text-sell bg-sell/10",
              )}
            >
              {s.apiKeyStatus}
            </span>
          </div>
        </Field>
      </Card>

      <Card title="Refresh">
        <Field label={`Refresh interval (${s.refreshIntervalSec}s)`}>
          <input
            type="range"
            min={5}
            max={60}
            value={s.refreshIntervalSec}
            onChange={(e) => setS({ ...s, refreshIntervalSec: +e.target.value })}
            className="w-full accent-[var(--accent)]"
          />
        </Field>
        <Field label={`Stale threshold (${s.staleThresholdSec}s)`}>
          <input
            type="range"
            min={30}
            max={600}
            step={10}
            value={s.staleThresholdSec}
            onChange={(e) => setS({ ...s, staleThresholdSec: +e.target.value })}
            className="w-full accent-[var(--accent)]"
          />
        </Field>
      </Card>

      <Card title="Watchlist" className="lg:col-span-2">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {s.watchlist.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1.5 rounded border border-bd bg-bg2/60 px-2 py-1 font-mono text-xs text-dim"
            >
              {p}
              <button onClick={() => removePair(p)} className="text-mute hover:text-sell">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newPair}
            onChange={(e) => setNewPair(e.target.value.toUpperCase())}
            placeholder="EURGBP"
            className="flex-1 rounded border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-xs text-tx focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => {
              if (newPair && !s.watchlist.includes(newPair as never)) {
                setS({ ...s, watchlist: [...s.watchlist, newPair as never] });
                setNewPair("");
              }
            }}
            className="rounded border border-bd bg-bg2 px-3 py-1.5 text-xs text-dim hover:text-tx hover:border-bd2"
          >
            Add
          </button>
        </div>
      </Card>

      <Card title="Risk allocation" className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberInput
            label="Per-trade %"
            value={s.riskAllocation.perTradePct}
            onChange={(v) =>
              setS({ ...s, riskAllocation: { ...s.riskAllocation, perTradePct: v } })
            }
          />
          <NumberInput
            label="Daily max %"
            value={s.riskAllocation.dailyMaxPct}
            onChange={(v) =>
              setS({ ...s, riskAllocation: { ...s.riskAllocation, dailyMaxPct: v } })
            }
          />
          <NumberInput
            label="DD cap %"
            value={s.riskAllocation.ddCapPct}
            onChange={(v) => setS({ ...s, riskAllocation: { ...s.riskAllocation, ddCapPct: v } })}
          />
        </div>
      </Card>
    </div>
  );
}

function RiskTab({ risk }: { risk: import("@/types/sniper").RiskProfile }) {
  const [r, setR] = useState(risk);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Profile">
        <Field label="Tier">
          <div className="flex gap-1">
            {(["conservative", "balanced", "aggressive"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setR({ ...r, tier: t })}
                className={cn(
                  "flex-1 rounded border px-2.5 py-1.5 text-xs capitalize transition-colors",
                  r.tier === t
                    ? "border-accent/60 bg-accent/15 text-accent"
                    : "border-bd bg-bg2/40 text-mute hover:text-dim",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        <NumberInput
          label="Max concurrent trades"
          value={r.maxConcurrentTrades}
          onChange={(v) => setR({ ...r, maxConcurrentTrades: v })}
          step={1}
        />
        <NumberInput
          label="Cooldown (min)"
          value={r.cooldownMin}
          onChange={(v) => setR({ ...r, cooldownMin: v })}
          step={1}
        />
      </Card>
      <Card title="Risk caps">
        <NumberInput
          label="Per-trade %"
          value={r.perTradePct}
          onChange={(v) => setR({ ...r, perTradePct: v })}
        />
        <NumberInput
          label="Daily max %"
          value={r.dailyMaxPct}
          onChange={(v) => setR({ ...r, dailyMaxPct: v })}
        />
        <NumberInput
          label="DD cap %"
          value={r.ddCapPct}
          onChange={(v) => setR({ ...r, ddCapPct: v })}
        />
      </Card>
      <div className="lg:col-span-2 flex items-center justify-end gap-3">
        <FreshnessBadge state="mock" />
        <button className="rounded-md border border-buy/50 bg-buy/15 px-4 py-2 text-sm font-semibold text-buy hover:bg-buy/25">
          Save risk profile
        </button>
      </div>
    </div>
  );
}

function Card({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-bd bg-bg1/60 p-4 space-y-3", className)}>
      <div className="text-[11px] font-mono uppercase tracking-wider text-mute">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-mono uppercase tracking-wider text-mute">
        {label}
      </label>
      {children}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full rounded border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-sm text-tx focus:outline-none focus:border-accent"
      />
    </Field>
  );
}
