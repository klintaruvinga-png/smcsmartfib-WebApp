import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCanonicalWatchlist,
  useUserSettings,
  useUserRiskProfile,
  useEngineHealth,
  useWatchlistAdd,
  useWatchlistRemove,
} from "@/hooks/useSniperData";
import { FreshnessBadge } from "@/components/sniper/FreshnessBadge";
import { WarningLine } from "@/components/sniper/Warnings";
import { cn } from "@/lib/utils";
import { Settings as SettingsIcon, Shield, KeyRound, Trash2, X } from "lucide-react";
import { apiClient, MOCK_MODE, normalizeBackendUrl, setBackendUrl } from "@/lib/api/sniperClient";
import { toast } from "sonner";
import type {
  DashboardSettings,
  FreshnessState,
  RiskProfile,
  Symbol,
  TwelveDataKeyStatus,
} from "@/types/sniper";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account & Settings - SMC SuperFIB" },
      {
        name: "description",
        content: "Backend URL, API key status, refresh interval, watchlist and risk profile.",
      },
      { property: "og:title", content: "Account & Settings - SMC SuperFIB" },
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

  if (!settings || !risk) return <div className="text-mute text-sm">Loading settings...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Account &amp; Settings</h1>
        <p className="text-xs text-mute mt-0.5">Configure backend, refresh and risk allocation</p>
      </div>

      {MOCK_MODE && (
        <WarningLine level="warn">
          App running in MOCK_MODE. Real REST calls disabled - all data is synthetic.
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

function SettingsTab({ settings }: { settings: DashboardSettings }) {
  const qc = useQueryClient();
  const { isFetching: isUserSettingsFetching, isSuccess: hasUserSettings } = useUserSettings();
  const { data: health } = useEngineHealth();
  const { watchlist, watchlistSet } = useCanonicalWatchlist();
  const [s, setS] = useState(settings);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [newPair, setNewPair] = useState("");
  const [pendingWatchlistSync, setPendingWatchlistSync] =
    useState<DashboardSettings["watchlist"] | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<TwelveDataKeyStatus>(settings.apiKeyStatus);
  const settingsEditVersion = useRef(0);
  const [busy, setBusy] = useState<"settings" | "test-key" | "save-key" | "delete-key" | null>(
    null,
  );
  const addWatchlistMutation = useWatchlistAdd();
  const removeWatchlistMutation = useWatchlistRemove();
  const watchlistBusy = addWatchlistMutation.isPending || removeWatchlistMutation.isPending;

  function syncDraftWatchlistFromCache(fallbackWatchlist: DashboardSettings["watchlist"]) {
    setPendingWatchlistSync(fallbackWatchlist);
  }

  useEffect(() => {
    if (!settingsDirty) {
      setS(settings);
    }
  }, [settings, settingsDirty]);

  useEffect(() => {
    setKeyStatus(settings.apiKeyStatus);
  }, [settings.apiKeyStatus]);

  useEffect(() => {
    if (!pendingWatchlistSync || !hasUserSettings || isUserSettingsFetching) return;
    setS((prev) => ({ ...prev, watchlist }));
    setPendingWatchlistSync(null);
  }, [hasUserSettings, isUserSettingsFetching, pendingWatchlistSync, watchlist]);

  function updateSettingsDraft(next: DashboardSettings) {
    settingsEditVersion.current += 1;
    setSettingsDirty(true);
    setS(next);
  }

  async function removePair(p: string) {
    if (watchlistBusy) return;
    try {
      const result = await removeWatchlistMutation.mutateAsync(p);
      syncDraftWatchlistFromCache(result.watchlist);
      toast.success(`${p} removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove symbol");
    }
  }

  async function addPair() {
    const sym = newPair
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!sym || watchlistSet.has(sym as Symbol)) return;
    setNewPair("");
    try {
      const result = await addWatchlistMutation.mutateAsync(sym);
      syncDraftWatchlistFromCache(result.watchlist);
      toast.success(`${sym} added to watchlist`);
    } catch (error) {
      // Only restore the failed symbol if the user has not already typed a replacement.
      setNewPair((current) => (current.trim() ? current : sym));
      toast.error(error instanceof Error ? error.message : "Failed to add symbol");
    }
  }

  const keyReady = apiKey.trim().length > 0;

  async function saveSettings(nextSettings?: DashboardSettings) {
    const submittedVersion = settingsEditVersion.current;
    const settingsToSave = {
      ...(nextSettings ?? s),
      backendUrl: normalizeBackendUrl((nextSettings ?? s).backendUrl),
    };
    const backendUrlChanged =
      settingsToSave.backendUrl !== normalizeBackendUrl(settings.backendUrl);
    setBusy("settings");
    try {
      await apiClient.postUserSettings(settingsToSave);
      // Persist the setting to the current backend before switching live reads.
      // Otherwise a migration target URL can hijack the save request and orphan the config.
      qc.setQueryData<DashboardSettings>(["user-settings"], settingsToSave);
      setBackendUrl(settingsToSave.backendUrl);
      if (!backendUrlChanged) {
        await qc.refetchQueries({ queryKey: ["user-settings"], type: "active" });
      }
      await Promise.all([
        qc.refetchQueries({ queryKey: ["engine-health"], type: "active" }),
        qc.refetchQueries({ queryKey: ["snapshot"], type: "active" }),
        qc.refetchQueries({ queryKey: ["live-signals"], type: "active" }),
      ]);
      setS(settingsToSave);
      if (settingsEditVersion.current === submittedVersion) {
        setSettingsDirty(false);
      }
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settings save failed");
    } finally {
      setBusy(null);
    }
  }

  async function testTwelveDataKey() {
    const previousStatus = keyStatus;
    setBusy("test-key");
    setKeyStatus("testing");
    try {
      const result = await apiClient.postTwelveDataKey({ apiKey: apiKey.trim(), testOnly: true });
      setKeyStatus(result.status);
      if (!result.ok) {
        toast.error(result.message ?? `Twelve Data key ${result.status}`);
        return;
      }
      toast.success("Twelve Data key validated");
    } catch (error) {
      setKeyStatus(previousStatus);
      toast.error(error instanceof Error ? error.message : "Twelve Data key test failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveTwelveDataKey() {
    const previousStatus = keyStatus;
    setBusy("save-key");
    setKeyStatus("testing");
    try {
      const result = await apiClient.postTwelveDataKey({ apiKey: apiKey.trim() });
      setKeyStatus(result.status);
      if (!result.ok) {
        toast.error(result.message ?? `Twelve Data key ${result.status}`);
        return;
      }
      setS({ ...s, apiKeyStatus: result.status });
      setApiKey("");
      await qc.refetchQueries({ queryKey: ["user-settings"], type: "active" });
      await Promise.all([
        qc.refetchQueries({ queryKey: ["engine-health"], type: "active" }),
        qc.refetchQueries({ queryKey: ["snapshot"], type: "active" }),
        qc.refetchQueries({ queryKey: ["live-signals"], type: "active" }),
      ]);
      toast.success("Twelve Data key saved");
    } catch (error) {
      setKeyStatus(previousStatus);
      toast.error(error instanceof Error ? error.message : "Twelve Data key save failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteTwelveDataKey() {
    setBusy("delete-key");
    try {
      const result = await apiClient.deleteTwelveDataKey();
      setKeyStatus(result.status);
      setS({ ...s, apiKeyStatus: result.status });
      setApiKey("");
      await qc.refetchQueries({ queryKey: ["user-settings"], type: "active" });
      await Promise.all([
        qc.refetchQueries({ queryKey: ["engine-health"], type: "active" }),
        qc.refetchQueries({ queryKey: ["snapshot"], type: "active" }),
        qc.refetchQueries({ queryKey: ["live-signals"], type: "active" }),
      ]);
      toast.success("Twelve Data key deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Twelve Data key delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Backend">
        <Field label="Backend URL">
          <input
            type="url"
            value={s.backendUrl}
            onChange={(e) => updateSettingsDraft({ ...s, backendUrl: e.target.value })}
            className="w-full rounded border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-xs text-tx focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="API key status">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-mute" />
            <KeyStatus status={keyStatus} />
          </div>
        </Field>
        <div className="flex justify-end">
          <button
            onClick={() => void saveSettings()}
            disabled={busy === "settings" || watchlistBusy}
            className="rounded-md border border-buy/50 bg-buy/15 px-3 py-1.5 text-xs font-semibold text-buy hover:bg-buy/25 disabled:opacity-60"
          >
            {busy === "settings" ? "Saving..." : "Save settings"}
          </button>
        </div>
      </Card>

      <Card title="Twelve Data">
        <Field label="User API key">
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter Twelve Data API key"
            className="w-full rounded border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-xs text-tx focus:outline-none focus:border-accent"
          />
        </Field>
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-mute" />
            <KeyStatus status={keyStatus} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={testTwelveDataKey}
              disabled={!keyReady || busy !== null}
              className="rounded border border-bd bg-bg2 px-3 py-1.5 text-xs text-dim hover:text-tx hover:border-bd2 disabled:opacity-50"
            >
              {busy === "test-key" ? "Testing..." : "Test"}
            </button>
            <button
              onClick={saveTwelveDataKey}
              disabled={!keyReady || busy !== null}
              className="rounded border border-buy/50 bg-buy/15 px-3 py-1.5 text-xs font-semibold text-buy hover:bg-buy/25 disabled:opacity-50"
            >
              {busy === "save-key" ? "Saving..." : "Save key"}
            </button>
            <button
              onClick={deleteTwelveDataKey}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded border border-sell/40 bg-sell/10 px-3 py-1.5 text-xs font-semibold text-sell hover:bg-sell/15 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {busy === "delete-key" ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
        {settings.apiKeyStatus === "ok" &&
          health &&
          ((health.twelveDataKeyStatus && health.twelveDataKeyStatus !== "ok") ||
            (!health.twelveDataKeyStatus && health.twelveDataKey === "missing")) && (
            <WarningLine level="warn">
              Settings reports key OK but engine health shows:{" "}
              <span className="font-semibold">
                {health.twelveDataKeyStatus
                  ? health.twelveDataKeyStatus.replace("-", " ")
                  : "key missing"}
              </span>
              . Backend sync may be pending.
            </WarningLine>
          )}
        <p className="text-[10px] font-mono text-mute">
          The key is submitted to WordPress for encrypted server-side use and is never returned to
          the browser.
        </p>
      </Card>

      <Card title="Refresh">
        <Field label={`Refresh interval (${s.refreshIntervalSec}s)`}>
          <input
            type="range"
            min={2}
            max={60}
            value={s.refreshIntervalSec}
            onChange={(e) => updateSettingsDraft({ ...s, refreshIntervalSec: +e.target.value })}
            className="w-full accent-[var(--accent)]"
          />
        </Field>
        <Field label={`Stale threshold (${s.staleThresholdSec}s)`}>
          <input
            type="range"
            min={10}
            max={60}
            step={10}
            value={s.staleThresholdSec}
            onChange={(e) => updateSettingsDraft({ ...s, staleThresholdSec: +e.target.value })}
            className="w-full accent-[var(--accent)]"
          />
        </Field>
        <div className="flex justify-end">
          <button
            onClick={() => void saveSettings()}
            disabled={busy === "settings" || watchlistBusy || !settingsDirty}
            className="rounded-md border border-buy/50 bg-buy/15 px-3 py-1.5 text-xs font-semibold text-buy hover:bg-buy/25 disabled:opacity-60"
          >
            {busy === "settings" ? "Saving..." : "Save"}
          </button>
        </div>
      </Card>

      <Card title="Watchlist" className="lg:col-span-2">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {watchlist.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1.5 rounded border border-bd bg-bg2/60 px-2 py-1 font-mono text-xs text-dim"
            >
              {p}
              <button
                onClick={() => removePair(p)}
                disabled={watchlistBusy}
                className="text-mute hover:text-sell disabled:opacity-40"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newPair}
            onChange={(e) => setNewPair(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && addPair()}
            placeholder="EURGBP"
            className="flex-1 rounded border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-xs text-tx focus:outline-none focus:border-accent"
          />
          <button
            onClick={addPair}
            disabled={watchlistBusy || !newPair.trim()}
            className="rounded border border-bd bg-bg2 px-3 py-1.5 text-xs text-dim hover:text-tx hover:border-bd2 disabled:opacity-50"
          >
            {addWatchlistMutation.isPending ? "Adding..." : "Add"}
          </button>
        </div>
      </Card>

      <Card title="Risk allocation" className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberInput
            label="Per-trade %"
            value={s.riskAllocation.perTradePct}
            onChange={(v) =>
              updateSettingsDraft({ ...s, riskAllocation: { ...s.riskAllocation, perTradePct: v } })
            }
          />
          <NumberInput
            label="Daily max %"
            value={s.riskAllocation.dailyMaxPct}
            onChange={(v) =>
              updateSettingsDraft({ ...s, riskAllocation: { ...s.riskAllocation, dailyMaxPct: v } })
            }
          />
          <NumberInput
            label="DD cap %"
            value={s.riskAllocation.ddCapPct}
            onChange={(v) =>
              updateSettingsDraft({ ...s, riskAllocation: { ...s.riskAllocation, ddCapPct: v } })
            }
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => void saveSettings()}
            disabled={busy === "settings" || watchlistBusy || !settingsDirty}
            className="rounded-md border border-buy/50 bg-buy/15 px-3 py-1.5 text-xs font-semibold text-buy hover:bg-buy/25 disabled:opacity-60"
          >
            {busy === "settings" ? "Saving..." : "Save"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function RiskTab({ risk }: { risk: RiskProfile }) {
  const qc = useQueryClient();
  const [r, setR] = useState(risk);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<FreshnessState | null>(null);

  async function saveRiskProfile() {
    setSaving(true);
    try {
      await apiClient.postUserRiskProfile(r);
      await qc.invalidateQueries({ queryKey: ["user-risk"] });
      setSaveState(MOCK_MODE ? "mock" : "live");
      toast.success("Risk profile saved");
    } catch (error) {
      setSaveState("stale");
      toast.error(error instanceof Error ? error.message : "Risk profile save failed");
    } finally {
      setSaving(false);
    }
  }

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
        {saveState && <FreshnessBadge state={saveState} />}
        <button
          onClick={saveRiskProfile}
          disabled={saving}
          className="rounded-md border border-buy/50 bg-buy/15 px-4 py-2 text-sm font-semibold text-buy hover:bg-buy/25 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save risk profile"}
        </button>
      </div>
    </div>
  );
}

function KeyStatus({ status }: { status: TwelveDataKeyStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono",
        status === "ok"
          ? "border-buy/40 text-buy bg-buy/10"
          : status === "missing" || status === "testing"
            ? "border-warn/40 text-warn bg-warn/10"
            : "border-sell/40 text-sell bg-sell/10",
      )}
    >
      {status}
    </span>
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
