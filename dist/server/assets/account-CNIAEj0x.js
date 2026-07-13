import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { x as useUserSettings, i as useUserRiskProfile, M as MOCK_MODE, W as WarningLine, f as cn, a as useEngineHealth, d as useCanonicalWatchlist, I as useWatchlistAdd, J as useWatchlistRemove, F as FreshnessBadge, K as normalizeBackendUrl, p as apiClient, L as setBackendUrl } from "./router-DONb8JY3.js";
import { Settings, Shield, KeyRound, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import "@tanstack/react-router";
import "clsx";
import "tailwind-merge";
import "recharts";
import "@radix-ui/react-slot";
import "class-variance-authority";
const WATCHLIST_LIMIT = 24;
function normalizeWatchlistDraft(watchlist) {
  const canonical = [];
  for (const symbol of watchlist ?? []) {
    if (typeof symbol !== "string") continue;
    const normalized = symbol.trim().toUpperCase();
    if (!normalized || canonical.includes(normalized)) continue;
    canonical.push(normalized);
    if (canonical.length === WATCHLIST_LIMIT) break;
  }
  return canonical;
}
function AccountPage() {
  const [tab, setTab] = useState("settings");
  const {
    data: settings
  } = useUserSettings();
  const {
    data: risk
  } = useUserRiskProfile();
  if (!settings || !risk) return /* @__PURE__ */ jsx("div", { className: "text-mute text-sm", children: "Loading settings..." });
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Account & Settings" }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-mute mt-0.5", children: "Configure backend, refresh and risk allocation" })
    ] }),
    MOCK_MODE && /* @__PURE__ */ jsx(WarningLine, { level: "warn", children: "App running in MOCK_MODE. Real REST calls disabled - all data is synthetic." }),
    /* @__PURE__ */ jsxs("div", { className: "flex gap-1 border-b border-bd", children: [
      /* @__PURE__ */ jsx(TabButton, { active: tab === "settings", onClick: () => setTab("settings"), icon: /* @__PURE__ */ jsx(Settings, { className: "h-3.5 w-3.5" }), children: "Settings" }),
      /* @__PURE__ */ jsx(TabButton, { active: tab === "risk", onClick: () => setTab("risk"), icon: /* @__PURE__ */ jsx(Shield, { className: "h-3.5 w-3.5" }), children: "Risk Profile" })
    ] }),
    tab === "settings" ? /* @__PURE__ */ jsx(SettingsTab, { settings }) : /* @__PURE__ */ jsx(RiskTab, { risk })
  ] });
}
function TabButton({
  active,
  onClick,
  icon,
  children
}) {
  return /* @__PURE__ */ jsxs("button", { onClick, className: cn("inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium transition-colors -mb-px border-b-2", active ? "border-accent text-accent" : "border-transparent text-mute hover:text-dim"), children: [
    icon,
    children
  ] });
}
function SettingsTab({
  settings
}) {
  const qc = useQueryClient();
  const {
    data: health
  } = useEngineHealth();
  const {
    watchlist,
    watchlistSet
  } = useCanonicalWatchlist();
  const [s, setS] = useState(settings);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [newPair, setNewPair] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyStatus, setKeyStatus] = useState(settings.apiKeyStatus);
  const settingsEditVersion = useRef(0);
  const [busy, setBusy] = useState(null);
  const addWatchlistMutation = useWatchlistAdd();
  const removeWatchlistMutation = useWatchlistRemove();
  const watchlistBusy = addWatchlistMutation.isPending || removeWatchlistMutation.isPending;
  function syncDraftWatchlistFromCache(nextWatchlist) {
    setS((prev) => ({
      ...prev,
      watchlist: normalizeWatchlistDraft(nextWatchlist)
    }));
  }
  useEffect(() => {
    if (!settingsDirty) {
      setS(settings);
    }
  }, [settings, settingsDirty]);
  useEffect(() => {
    setKeyStatus(settings.apiKeyStatus);
  }, [settings.apiKeyStatus]);
  function updateSettingsDraft(next) {
    settingsEditVersion.current += 1;
    setSettingsDirty(true);
    setS(next);
  }
  async function removePair(p) {
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
    const sym = newPair.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!sym || watchlistSet.has(sym)) return;
    setNewPair("");
    try {
      const result = await addWatchlistMutation.mutateAsync(sym);
      syncDraftWatchlistFromCache(result.watchlist);
      toast.success(`${sym} added to watchlist`);
    } catch (error) {
      setNewPair((current) => current.trim() ? current : sym);
      toast.error(error instanceof Error ? error.message : "Failed to add symbol");
    }
  }
  const keyReady = apiKey.trim().length > 0;
  async function saveSettings(nextSettings) {
    const submittedVersion = settingsEditVersion.current;
    const settingsToSave = {
      ...s,
      backendUrl: normalizeBackendUrl(s.backendUrl)
    };
    const backendUrlChanged = settingsToSave.backendUrl !== normalizeBackendUrl(settings.backendUrl);
    setBusy("settings");
    try {
      await apiClient.postUserSettings(settingsToSave);
      qc.setQueryData(["user-settings"], settingsToSave);
      setBackendUrl(settingsToSave.backendUrl);
      if (!backendUrlChanged) {
        await qc.refetchQueries({
          queryKey: ["user-settings"],
          type: "active"
        });
      }
      await Promise.all([qc.refetchQueries({
        queryKey: ["engine-health"],
        type: "active"
      }), qc.refetchQueries({
        queryKey: ["snapshot"],
        type: "active"
      }), qc.refetchQueries({
        queryKey: ["live-signals"],
        type: "active"
      })]);
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
      const result = await apiClient.postTwelveDataKey({
        apiKey: apiKey.trim(),
        testOnly: true
      });
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
      const result = await apiClient.postTwelveDataKey({
        apiKey: apiKey.trim()
      });
      setKeyStatus(result.status);
      if (!result.ok) {
        toast.error(result.message ?? `Twelve Data key ${result.status}`);
        return;
      }
      setS({
        ...s,
        apiKeyStatus: result.status
      });
      setApiKey("");
      await qc.refetchQueries({
        queryKey: ["user-settings"],
        type: "active"
      });
      await Promise.all([qc.refetchQueries({
        queryKey: ["engine-health"],
        type: "active"
      }), qc.refetchQueries({
        queryKey: ["snapshot"],
        type: "active"
      }), qc.refetchQueries({
        queryKey: ["live-signals"],
        type: "active"
      })]);
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
      setS({
        ...s,
        apiKeyStatus: result.status
      });
      setApiKey("");
      await qc.refetchQueries({
        queryKey: ["user-settings"],
        type: "active"
      });
      await Promise.all([qc.refetchQueries({
        queryKey: ["engine-health"],
        type: "active"
      }), qc.refetchQueries({
        queryKey: ["snapshot"],
        type: "active"
      }), qc.refetchQueries({
        queryKey: ["live-signals"],
        type: "active"
      })]);
      toast.success("Twelve Data key deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Twelve Data key delete failed");
    } finally {
      setBusy(null);
    }
  }
  return /* @__PURE__ */ jsxs("div", { className: "grid gap-3 lg:grid-cols-2", children: [
    /* @__PURE__ */ jsxs(Card, { title: "Backend", children: [
      /* @__PURE__ */ jsx(Field, { label: "Backend URL", children: /* @__PURE__ */ jsx("input", { type: "url", value: s.backendUrl, onChange: (e) => updateSettingsDraft({
        ...s,
        backendUrl: e.target.value
      }), className: "w-full rounded border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-xs text-tx focus:outline-none focus:border-accent" }) }),
      /* @__PURE__ */ jsx(Field, { label: "API key status", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(KeyRound, { className: "h-4 w-4 text-mute" }),
        /* @__PURE__ */ jsx(KeyStatus, { status: keyStatus })
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsx("button", { onClick: () => void saveSettings(), disabled: busy === "settings" || watchlistBusy, className: "rounded-md border border-buy/50 bg-buy/15 px-3 py-1.5 text-xs font-semibold text-buy hover:bg-buy/25 disabled:opacity-60", children: busy === "settings" ? "Saving..." : "Save settings" }) })
    ] }),
    /* @__PURE__ */ jsxs(Card, { title: "Twelve Data", children: [
      /* @__PURE__ */ jsx(Field, { label: "User API key", children: /* @__PURE__ */ jsx("input", { type: "password", autoComplete: "off", value: apiKey, onChange: (e) => setApiKey(e.target.value), placeholder: "Enter Twelve Data API key", className: "w-full rounded border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-xs text-tx focus:outline-none focus:border-accent" }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap justify-between gap-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(KeyRound, { className: "h-4 w-4 text-mute" }),
          /* @__PURE__ */ jsx(KeyStatus, { status: keyStatus })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsx("button", { onClick: testTwelveDataKey, disabled: !keyReady || busy !== null, className: "rounded border border-bd bg-bg2 px-3 py-1.5 text-xs text-dim hover:text-tx hover:border-bd2 disabled:opacity-50", children: busy === "test-key" ? "Testing..." : "Test" }),
          /* @__PURE__ */ jsx("button", { onClick: saveTwelveDataKey, disabled: !keyReady || busy !== null, className: "rounded border border-buy/50 bg-buy/15 px-3 py-1.5 text-xs font-semibold text-buy hover:bg-buy/25 disabled:opacity-50", children: busy === "save-key" ? "Saving..." : "Save key" }),
          /* @__PURE__ */ jsxs("button", { onClick: deleteTwelveDataKey, disabled: busy !== null, className: "inline-flex items-center gap-1 rounded border border-sell/40 bg-sell/10 px-3 py-1.5 text-xs font-semibold text-sell hover:bg-sell/15 disabled:opacity-50", children: [
            /* @__PURE__ */ jsx(Trash2, { className: "h-3.5 w-3.5" }),
            busy === "delete-key" ? "Deleting..." : "Delete"
          ] })
        ] })
      ] }),
      settings.apiKeyStatus === "ok" && health && (health.twelveDataKeyStatus && health.twelveDataKeyStatus !== "ok" || !health.twelveDataKeyStatus && health.twelveDataKey === "missing") && /* @__PURE__ */ jsxs(WarningLine, { level: "warn", children: [
        "Settings reports key OK but engine health shows:",
        " ",
        /* @__PURE__ */ jsx("span", { className: "font-semibold", children: health.twelveDataKeyStatus ? health.twelveDataKeyStatus.replace("-", " ") : "key missing" }),
        ". Backend sync may be pending."
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-[10px] font-mono text-mute", children: "The key is submitted to WordPress for encrypted server-side use and is never returned to the browser." })
    ] }),
    /* @__PURE__ */ jsxs(Card, { title: "Refresh", children: [
      /* @__PURE__ */ jsx(Field, { label: `Refresh interval (${s.refreshIntervalSec}s)`, children: /* @__PURE__ */ jsx("input", { type: "range", min: 2, max: 60, value: s.refreshIntervalSec, onChange: (e) => updateSettingsDraft({
        ...s,
        refreshIntervalSec: +e.target.value
      }), className: "w-full accent-[var(--accent)]" }) }),
      /* @__PURE__ */ jsx(Field, { label: `Stale threshold (${s.staleThresholdSec}s)`, children: /* @__PURE__ */ jsx("input", { type: "range", min: 10, max: 60, step: 10, value: s.staleThresholdSec, onChange: (e) => updateSettingsDraft({
        ...s,
        staleThresholdSec: +e.target.value
      }), className: "w-full accent-[var(--accent)]" }) }),
      /* @__PURE__ */ jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsx("button", { onClick: () => void saveSettings(), disabled: busy === "settings" || watchlistBusy || !settingsDirty, className: "rounded-md border border-buy/50 bg-buy/15 px-3 py-1.5 text-xs font-semibold text-buy hover:bg-buy/25 disabled:opacity-60", children: busy === "settings" ? "Saving..." : "Save" }) })
    ] }),
    /* @__PURE__ */ jsxs(Card, { title: "Watchlist", className: "lg:col-span-2", children: [
      /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1.5 mb-3", children: watchlist.map((p) => /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1.5 rounded border border-bd bg-bg2/60 px-2 py-1 font-mono text-xs text-dim", children: [
        p,
        /* @__PURE__ */ jsx("button", { onClick: () => removePair(p), disabled: watchlistBusy, className: "text-mute hover:text-sell disabled:opacity-40", children: /* @__PURE__ */ jsx(X, { className: "h-3 w-3" }) })
      ] }, p)) }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsx("input", { value: newPair, onChange: (e) => setNewPair(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")), onKeyDown: (e) => e.key === "Enter" && addPair(), placeholder: "EURGBP", className: "flex-1 rounded border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-xs text-tx focus:outline-none focus:border-accent" }),
        /* @__PURE__ */ jsx("button", { onClick: addPair, disabled: watchlistBusy || !newPair.trim(), className: "rounded border border-bd bg-bg2 px-3 py-1.5 text-xs text-dim hover:text-tx hover:border-bd2 disabled:opacity-50", children: addWatchlistMutation.isPending ? "Adding..." : "Add" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Card, { title: "Risk allocation", className: "lg:col-span-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [
        /* @__PURE__ */ jsx(NumberInput, { label: "Per-trade %", value: s.riskAllocation.perTradePct, onChange: (v) => updateSettingsDraft({
          ...s,
          riskAllocation: {
            ...s.riskAllocation,
            perTradePct: v
          }
        }) }),
        /* @__PURE__ */ jsx(NumberInput, { label: "Daily max %", value: s.riskAllocation.dailyMaxPct, onChange: (v) => updateSettingsDraft({
          ...s,
          riskAllocation: {
            ...s.riskAllocation,
            dailyMaxPct: v
          }
        }) }),
        /* @__PURE__ */ jsx(NumberInput, { label: "DD cap %", value: s.riskAllocation.ddCapPct, onChange: (v) => updateSettingsDraft({
          ...s,
          riskAllocation: {
            ...s.riskAllocation,
            ddCapPct: v
          }
        }) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsx("button", { onClick: () => void saveSettings(), disabled: busy === "settings" || watchlistBusy || !settingsDirty, className: "rounded-md border border-buy/50 bg-buy/15 px-3 py-1.5 text-xs font-semibold text-buy hover:bg-buy/25 disabled:opacity-60", children: busy === "settings" ? "Saving..." : "Save" }) })
    ] })
  ] });
}
function RiskTab({
  risk
}) {
  const qc = useQueryClient();
  const [r, setR] = useState(risk);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState(null);
  async function saveRiskProfile() {
    setSaving(true);
    try {
      await apiClient.postUserRiskProfile(r);
      await qc.invalidateQueries({
        queryKey: ["user-risk"]
      });
      setSaveState(MOCK_MODE ? "mock" : "live");
      toast.success("Risk profile saved");
    } catch (error) {
      setSaveState("stale");
      toast.error(error instanceof Error ? error.message : "Risk profile save failed");
    } finally {
      setSaving(false);
    }
  }
  return /* @__PURE__ */ jsxs("div", { className: "grid gap-3 lg:grid-cols-2", children: [
    /* @__PURE__ */ jsxs(Card, { title: "Profile", children: [
      /* @__PURE__ */ jsx(Field, { label: "Tier", children: /* @__PURE__ */ jsx("div", { className: "flex gap-1", children: ["conservative", "balanced", "aggressive"].map((t) => /* @__PURE__ */ jsx("button", { onClick: () => setR({
        ...r,
        tier: t
      }), className: cn("flex-1 rounded border px-2.5 py-1.5 text-xs capitalize transition-colors", r.tier === t ? "border-accent/60 bg-accent/15 text-accent" : "border-bd bg-bg2/40 text-mute hover:text-dim"), children: t }, t)) }) }),
      /* @__PURE__ */ jsx(NumberInput, { label: "Max concurrent trades", value: r.maxConcurrentTrades, onChange: (v) => setR({
        ...r,
        maxConcurrentTrades: v
      }), step: 1 }),
      /* @__PURE__ */ jsx(NumberInput, { label: "Cooldown (min)", value: r.cooldownMin, onChange: (v) => setR({
        ...r,
        cooldownMin: v
      }), step: 1 })
    ] }),
    /* @__PURE__ */ jsxs(Card, { title: "Risk caps", children: [
      /* @__PURE__ */ jsx(NumberInput, { label: "Per-trade %", value: r.perTradePct, onChange: (v) => setR({
        ...r,
        perTradePct: v
      }) }),
      /* @__PURE__ */ jsx(NumberInput, { label: "Daily max %", value: r.dailyMaxPct, onChange: (v) => setR({
        ...r,
        dailyMaxPct: v
      }) }),
      /* @__PURE__ */ jsx(NumberInput, { label: "DD cap %", value: r.ddCapPct, onChange: (v) => setR({
        ...r,
        ddCapPct: v
      }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 flex items-center justify-end gap-3", children: [
      saveState && /* @__PURE__ */ jsx(FreshnessBadge, { state: saveState }),
      /* @__PURE__ */ jsx("button", { onClick: saveRiskProfile, disabled: saving, className: "rounded-md border border-buy/50 bg-buy/15 px-4 py-2 text-sm font-semibold text-buy hover:bg-buy/25 disabled:opacity-60", children: saving ? "Saving..." : "Save risk profile" })
    ] })
  ] });
}
function KeyStatus({
  status
}) {
  return /* @__PURE__ */ jsx("span", { className: cn("inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono", status === "ok" ? "border-buy/40 text-buy bg-buy/10" : status === "missing" || status === "testing" ? "border-warn/40 text-warn bg-warn/10" : "border-sell/40 text-sell bg-sell/10"), children: status });
}
function Card({
  title,
  className,
  children
}) {
  return /* @__PURE__ */ jsxs("div", { className: cn("rounded-lg border border-bd bg-bg1/60 p-4 space-y-3", className), children: [
    /* @__PURE__ */ jsx("div", { className: "text-[11px] font-mono uppercase tracking-wider text-mute", children: title }),
    children
  ] });
}
function Field({
  label,
  children
}) {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ jsx("label", { className: "block text-[10px] font-mono uppercase tracking-wider text-mute", children: label }),
    children
  ] });
}
function NumberInput({
  label,
  value,
  onChange,
  step = 0.1
}) {
  return /* @__PURE__ */ jsx(Field, { label, children: /* @__PURE__ */ jsx("input", { type: "number", value, step, onChange: (e) => onChange(+e.target.value), className: "w-full rounded border border-bd bg-bg2/60 px-2.5 py-1.5 font-mono text-sm text-tx focus:outline-none focus:border-accent" }) });
}
export {
  AccountPage as component
};
