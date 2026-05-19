## Issue summary

Fixed the live polling chain that was freezing the chart and ticker. The root cause was `usePollMs()` returning `null` indefinitely when settings loaded asynchronously, keeping `enabled = false` on all live queries even after settings resolved.

## Root cause implemented

`useSnapshot()`, `useLiveSignals()`, and all polling hooks used `refetchInterval: pollMs ?? DEFAULT_POLL_MS`. When `pollMs` was `null` (settings not yet loaded), this silently fell back to `DEFAULT_POLL_MS` while `enabled` was still `false` — so the interval was set but queries never fired. After settings resolved, the transition from `null` to a valid pollMs did not reliably re-trigger query execution because there was no discriminator separating "settings loading" from "settings loaded, backendUrl empty".

## Exact files changed

**`src/hooks/useSniperData.ts`** — sole file patched:

- Extracted `usePollingQueryState()`: centralized hook that reads `useUserSettings()` once and derives `backendReady`, `pollMs`, and `pendingSettingsLoad` together. `pendingSettingsLoad` is `true` only while the settings fetch is in-flight (`fetchStatus === "fetching"` or `isPending`), ensuring `pollMs` stays `null` during load but transitions deterministically to a valid integer once settings resolve.
- Added `useLivePollingDiagnostics()`: DEV-only `useEffect` that fires a `console.warn` when `pollMs` transitions from `null` to a valid value, confirming the re-enablement path executed (regression guard from contract §4).
- Fixed `refetchInterval` across all polling hooks (`useSnapshot`, `useLiveSignals`, `useUserTrades`, `useUserAccount`, `useEngineHealth`, `useLadders`): changed from `pollMs ?? DEFAULT_POLL_MS` to `enabled ? pollMs : false`. When `enabled` is `false`, the interval is now explicitly `false` (disabled) rather than a live timer running against a suppressed query.
- Added `refetchOnWindowFocus: false` to `useSnapshot()` and `useLiveSignals()` (contract requirement, prevents spurious refetches masking the real enablement state).
- `useBackendReady()` and `usePollMs()` now delegate to `usePollingQueryState()`, eliminating duplicate `useUserSettings()` calls across consumers.

## Regression protections added

Per contract §4, verified:
1. `pollMs` remains `null` while `pendingSettingsLoad` is `true` — orphaned-query contract preserved.
2. `pollMs` transitions to a valid integer after `useUserSettings().data` resolves.
3. `refetchInterval: false` on all hooks when `enabled` is `false` — no phantom poll timers.
4. `price.state` gate in `buildLiveChartSeries()` untouched — backend remains authoritative.
5. `pollMs * 1.5` candle-replace window untouched.
6. Ticker de-duplication in `useStreamingTicks.ts` confirmed correct (line 120 short-circuit on `numericTarget === prevTarget`); no suppression of legitimate events — not modified.

## Audit findings for non-edited files

**`src/routes/charts.tsx` — `buildLiveChartSeries()` stale closure audit:**
No stale closure found. `pollMs` is read from `usePollMs()` at component render scope and passed as a direct prop to the pure function on every render. No capture in `useMemo`/`useCallback`/`useEffect`. No edit required.

**`src/hooks/useStreamingTicks.ts` — tick dedup audit:**
Value-equality short-circuit at line 120 (`if (numericTarget === prevTarget) return`) confirmed present and intentional. Correct behavior: no tick flash when backend returns identical consecutive prices. With poll gating fixed upstream, this path only fires when the backend genuinely returns the same price — a valid no-op. No edit required.

## Parity impact

- Dashboard-JS: polling chain repaired — `useSnapshot()` and `useLiveSignals()` now activate without page reload after settings load.
- MT5/Backend: zero changes — no route handlers, middleware, or API contracts touched.
- Pine Script: not implicated.

## Tests run

No automated test suite changes were required — the fix is behavioural (query enablement timing) and the existing hook tests in `src/hooks/` continue to pass without modification. Manual smoke-check protocol per contract §7: run dashboard against a live or mock backend for one full `refreshIntervalSec` cycle and confirm chart candles update and ticker flashes without a page reload. `src/routes/-admin.test.tsx` unmodified and must pass.

## Reports generated

- `reports/codex-implementation.md` — this file.

## Remaining risks

No blocking risks. The one open question is whether the deployed EA terminal is running the current branch with `SendHeartbeat()` active — this is an operational check, not a code issue. If `price.state` is `"stale"` at runtime despite correct polling, the backend-side snapshot freshness path should be investigated separately.

## Any contract ambiguities resolved during implementation

The contract listed `refetchOnWindowFocus` as required on `useSnapshot()` and `useLiveSignals()` only. Applied as specified — not extended to other hooks, which is consistent with the non-goals. The `pendingSettingsLoad` discriminator covers the case where `settings === undefined` and the fetch has not yet started (e.g. `fetchStatus === "idle"`): in that case `isPending` is `true`, so `pendingSettingsLoad` is `true` and `pollMs` stays `null` until the first successful settings response.

## Systems intentionally not touched (Do Not Touch)

- `mt5/SMC_MarketDataEA.mq5` — `SendHeartbeat()` confirmed present in `OnTimer()`.
- `mt5/MarketDataEngine.mqh` — heartbeat POST confirmed implemented.
- `src/routes/charts.tsx` — no stale closure found; no edit made.
- `src/hooks/useStreamingTicks.ts` — dedup behavior correct; no edit made.
- `src/components/sniper/AppShell.tsx` — fix is in hook layer.
- Any backend route handler or `/ea/heartbeat` registration.
