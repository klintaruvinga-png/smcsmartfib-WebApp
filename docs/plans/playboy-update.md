# SMC SuperFIB WebApp — Improvement Playbook (`playby-update`)

> **Context.** A `/website-development` skill review of the current app state (the SMC SuperFIB
> Dashboard WebApp). Goal: surface redundancy, better approaches, and things that should be
> implemented differently — judged against the skill's non-negotiables (mobile-first, ~3s mobile
> load budget, 16px text, 44px touch targets, semantic HTML, no secrets in code, native-over-lib,
> and Section 18 anti-patterns: desktop-first shrink, redundant abstractions, hardcoded values).
>
> **Deliverable.** `docs/plans/playby-update.md` — the consolidated, prioritized improvement plan.
>
> **Stack confirmed.** React 19 + TanStack Router/Start + TanStack Query + Tailwind v4 + shadcn/ui
> (`src/components/ui/*`) + bun + vitest. Monorepo: `packages/contracts` (shared TS types, re-exported
> by `src/types/sniper.ts`) + the `src/` app. Nine routes per `.lovable/plan.md` plus `admin`,
> `login`, `admin.soak-report`. Dark institutional fintech, freshness-first UI.
>
> **Method.** 3 parallel Explore agents (redundancy, architecture/anti-patterns, UI layer) + targeted
> verification of the two headline defects. File:line refs are from those passes; verify each before
> editing (especially the "delete" items — grep first).

---

## 1. Current-state strengths (preserve — do not regress)

- **Mobile-first CSS is correct.** `AppShell.tsx` uses `BottomNav` `md:hidden` + `LeftRail` `hidden md:flex` + `main` `pb-20 md:pb-4`. No desktop-first shrink detected.
- **TanStack Query is the single source of truth.** Settings/watchlist/backend URL flow through `useUserSettings`; polling gated on `backendReady && pollMs !== null`; mutations use optimistic `setQueryData` + rollback (`useSniperData.ts:441-498`). Solid.
- **Error / empty / loading states are strong.** `SettingsQueryErrorState`, skeletons, and `FreshnessBadge` cover pending / settings-failed / missing-backend-url / empty / error across pages.
- **Non-color differentiation mostly present.** SyncChip (LIVE/STALE/MOCK), SignalStatusChip (RDY/ARM/WTC), DirectionBadge arrows, VerdictBadge letters pair color with text/icon. The one color-only gap is the missing `text-ok` (finding D1).
- **Tests are colocated** (`*.test.tsx` beside sources). `PlanCard.tsx` / `account.tsx` are large but internally well-sectioned.

---

## 2. Findings (ranked, grouped)

### A. Performance — mobile load/CPU budget (highest leverage)

- **A1. Chart libs never lazy-loaded.** `analytics.tsx:13` imports `recharts` eagerly; `charts.tsx:17` imports `TVChart` which pulls `lightweight-charts` (`TVChart.tsx:1-9`). Zero `React.lazy`/`Suspense` anywhere. Both heavy libs ship in the initial bundle on every route. → Code-split `/charts` and `/analytics` (`const TVChart = lazy(() => import("@/components/sniper/TVChart"))` wrapped in `<Suspense>`).
- **A2. `TVChart` runs a perpetual `requestAnimationFrame` loop.** `TVChart.tsx:125-130` `tick()` calls `positionLabels()` every frame forever, even when `series`/`fibs` are static. Burns CPU/battery on phones while mounted. → Reposition labels inside the existing `useEffect`s keyed on `series`/`fibs`/`symbol` (lines 141-198) or via `chart.timeScale().subscribeVisibleLogicalRangeChange(...)`. Drop the infinite loop.
- **A3. `PlanCard` re-renders fully on every 2s poll.** `PlanCard.tsx:27` is not `React.memo`'d and the page passes a new `price` object each tick; `entryRows`/`targetRows` (lines 70-153) are rebuilt every render with no `useMemo`. → Wrap in `React.memo`, memoize `entryRows`/`targetRows` by `plan`, pass primitive price fields where possible.
- **A4. `HeaderTicker` doubles the DOM + spawns a per-item animation loop.** `AppShell.tsx:176` `const loop = [...aligned, ...aligned]` duplicates every watchlist item for the marquee, and each `HeaderTickerItem` (line 86) runs its own `useStreamingTicks` rAF off-screen. → CSS-only marquee/transform on a single track, or render the duplicated set once and animate the track.

### B. Redundancy / dead code (cleanup + bundle wins)

- **B1. Two near-identical motion hooks + a third copy of a primitive.** `useAnimatedNumber.ts` and `useStreamingTicks.ts` implement the same direction-aware stream (`{value, direction, heldDirection, motionKey, motionImpulse}`) and duplicate ~10 helpers verbatim (`toFiniteNumber`, `clamp`, `compressImpulse`, seeded RNG, `sampleNormal`/`gauss`, hermite/bridge interpolation, drift/vol estimation). `useTickFlash.ts:5` defines a *third* `toFiniteNumber` and `:3` a second `TickDirection`. → Merge into one `useMotionNumber(value, { mode: "raf" | "interval", durationMs, holdMs })`; fold the shared primitives in. Removes ~22KB of duplicated logic.
- **B2. ~28 unused shadcn/ui components.** Verified: `card`, `accordion`, `select`, `tabs`, `table`, `chart`, `alert`, `sonner`, `switch`, `progress`, `popover` (and others) have **zero imports** in `src/`. Notably `chart.tsx` is a full recharts wrapper that `analytics.tsx` bypasses by importing `recharts` directly. → Delete the unused primitives (grep `from "@/components/ui/<x>"` first to confirm each).
- **B3. Dead format exports.** `fmtZAR` (`format.ts:63`) and `fmtUSC` (`:59`) have 0 usages. → Delete.
- **B4. Dead misc exports.** `BUILD_ID` + bare `APP_VERSION` (`version.ts`) and `getBackendUrl()` (`sniperClient.ts:121`) are never referenced. → Delete (keep `APP_VERSION_LABEL`, `SCHEMA_VERSION`).
- **B5. Duplicated broker-suffix symbol normalization.** `-plan.utils.ts:46-89` (`BROKER_SUFFIXES`, `normalizePlanSymbol`, `hasCentOrMicroSuffix`) vs `useSniperData.ts:279-297` (`COMPARISON_SUFFIXES`, `normalizeSymbolForWatchlistComparison`). Overlapping suffix lists. → One shared `src/lib/symbols.ts` with a single suffix table + `normalizeSymbolForComparison()`; both callers import it.
- **B6. `getSnapshot` is a redundant alias of `getUnifiedSnapshot`.** `sniperClient.ts:277-279` just delegates; only caller is `admin.tsx:221`. → Call `getUnifiedSnapshot` directly, delete the alias.
- **B7. Duplicated rotating-loading-message effect.** `TradingLoadingScreen.tsx:20-26` and `PlanBoardSkeleton.tsx:8-14` both run the `nextRandomIndex` interval. → Extract `useRotatingMessage(messages, intervalMs)` into `loadingMessages.ts`.
- **B8. Overlapping currency formatters.** `fmtCurrency` (`format.ts:34`) and `fmtLocalCurrency` (`:67`) both format money; `fmtLocalCurrency` is used once (`PlanCard.tsx:298`, for ZAR). → Route the ZAR case through `fmtCurrency` (or make `fmtLocalCurrency` a thin `Intl`-based variant) so there is one currency formatter.
- **B9. Scattered inline trailing-zero / price formatting.** `admin.tsx:1915` and `PlanCard.tsx:636` each hand-roll `toFixed().replace(/0+$/...)`; `analytics.tsx:93,104` and `-book.page.tsx:119` hand-roll money/percent strings that bypass `fmtPrice`/`fmtPct`. → Extract `trimTrailingZeros()` and route display formatting through `fmtPrice`/`fmtPct`.
- **B10. Mock decimals map duplicates `fmtPrice` precision.** `mocks/sniperData.ts:470-471` encodes symbol→decimals (XAUUSD=2, JPY=3, else=5) — same knowledge as `fmtPrice`. → Share a `priceDecimals(symbol)` helper.

### C. Architecture & type safety

- **C1. No runtime validation — contracts are TS-only with blind casts.** `packages/contracts/src/index.ts` has no Zod; `normalizers.ts:116,135` cast raw rows with `symbol: row.symbol as Symbol`, and `MarketSnapshot` has `[key: string]: unknown`. A malformed/variant backend response passes type-check but can crash at render. → Add Zod schemas (or `z.infer`) for `PairPrice`, `SignalCandidate`, `TradePlan`, `AccountTelemetry`, etc.; `safeParse` inside `normalizers.ts` with a typed error boundary. Derive `Symbol` from a Zod enum + branded string, not `string & {}`.
- **C2. Side effect during render in `useStableUserTrades`.** `useSniperData.ts:175-203` mutates `continuityRef`/`continuitySnapshotRef` and calls `reconcileUserTrades` **in the render body** — impure; StrictMode double-invoke or concurrent re-renders can corrupt trade-continuity state. → Move reconciliation into a `useEffect` (or `useMemo` over `tradesQuery.data`/`pollMs`), returning the reconciled value.
- **C3. Duplicated watchlist constants.** `account.tsx:43-55` re-implements `WATCHLIST_LIMIT = 24` + `normalizeWatchlistDraft`, duplicating `WATCHLIST_LIMIT` + `normalizeWatchlist` in `useSniperData.ts:10,267-277`. → Export and reuse from `useSniperData`.
- **C4. `charts.tsx` reads an undocumented field.** `charts.tsx:112-115` uses `"nextCandleAt" in chart` / `chart.nextCandleAt`, but `ChartSnapshot` (`packages/contracts/src/index.ts:166-173`) doesn't declare it. → Add `nextCandleAt?: number` to `ChartSnapshot` or drop the field (contract drift).

### D. UI / design-system consistency

- **D1. `text-ok` is an undefined token — visible defect on the Plan page.** Used 4× in `-plan.page.tsx:240,247,252,257` (the "backend-confirmed" / "OK" / "READY" positive state), but `styles.css` defines only `buy/sell/warn/info/violet/accent` — there is **no `ok` color**, so the positive gating indicator renders colorless. → Add `--ok` + `.text-ok` (reuse `--buy`/`--info`), or switch those sites to `text-buy`.
- **D2. MOCK badge not surfaced on the Plan page.** `-plan.page.tsx:119-135` `getFreshnessState()` can only return `live | pending-sync | unavailable` — never `mock`. In `MOCK_MODE`, `FreshnessBadge` (line 317) never shows MOCK there, though WalletOverview/charts derive it from `data.state`. → Have `getFreshnessState()` honor `MOCK_MODE`/snapshot `mock`, or render a global `MOCK_MODE` banner (the `/account` warning at `account.tsx:71` is page-local only).
- **D3. Hardcoded hexes + off-brand palette bypass design tokens.** `VerdictBadge.tsx:5` uses `text-[#1a1208]` (dark-on-accent ink) instead of a token; `#46d19a`/`#9cb0c9`/`#102033` are inlined in `analytics.tsx:83-84,90,97,109` and `AppShell.tsx:389` (the `#102033` toast bg is repeated in two files); `#1a1208` dark-on-accent text is copy-pasted in `VerdictBadge.tsx:5`, `BrandPulseLogo.tsx:28`, `index.tsx:62`, `login.tsx:47`. Separately, `TVChart.tsx:24-25` draws buy/sell as `#3ecf8e`/`#ef5b5b` while the tokens are `--buy #46d19a` / `--sell #ff9a92` — two different greens/reds across the app. → Add `--on-accent` (#1a1208) and `--toast-bg` (or reuse `--bg2`) tokens; reference them; align `TVChart` to the tokens (or define explicit `--chart-buy`/`--chart-sell` if the lighter shades are deliberate); chart/SVG colors should pull from tokens where possible.
- **D4. Direction / Status / Key badges re-implemented inline ~6×.** The exact `border-buy/40 text-buy bg-buy/10` (LONG) / `border-sell/40 text-sell bg-sell/10` (SELL) recipe and the status→color map are copy-pasted instead of reused:
  - `PlanCard.tsx:407-428` local `DirectionBadge` (NOT exported) · `:430-445` local `StatusBadge` (NOT exported).
  - `-book.page.tsx:588-597` (desktop) + `:769-778` (mobile) — two copies in one file.
  - `orders.tsx:90-99` · `-signals.page.tsx:256-267` inline `StatusBadge` (identical to PlanCard's) + `:246-253` direction-as-text.
  - `account.tsx:580-588` `KeyStatus` badge (same pattern, new state colors).
  - `PlanCard.tsx:447-456` `MetaPill` and `:464-486` `MetaChip` are near-duplicate pills differing only in padding/tone.
  → Promote `DirectionBadge` + `StatusBadge` (+ tone-driven `KeyStatus`/`MetaLabel`) to `src/components/sniper/` and import everywhere; collapse `MetaPill`/`MetaChip` into one `MetaLabel` with a `tone` prop. Today any token/color change must be edited in 6+ places. (Note: `FreshnessBadge`/`VerdictBadge`/`Indicators` badges ARE correctly reused in `-live`/`-book`/`-signals`; the gap is specifically the direction/status badges.)
- **D5. Touch targets below 44px.** Refresh button `AppShell.tsx:244` is `h-9 w-9` (36px); watchlist remove `X` (`account.tsx:426-432`) has ~12px hit area and no `aria-label`; `BottomNav` is `grid-cols-9` with 9px labels (`AppShell.tsx:322-339`) — cramped on small phones. → Enlarge refresh to ≥44px; wrap the `X` with `p-2` + `aria-label={`Remove ${p}`}`; widen bottom-nav labels/spacing.
- **D6. Planned components missing as standalone units: `RegimeBar`, `PriceTicker`, `PairCard`.** `RegimeBar` is inlined in `-live.page.tsx:340-376` (BiasBadge + GateBadge + AnchorChopBadge + AnchorPositionMeter markup); `PriceTicker` is embedded as `HeaderTicker` inside `AppShell.tsx:167-202` (not reusable); `PairCard` does not exist (plan cards use the 647-line `PlanCard.tsx`, which couples signal+plan+price). → Extract `RegimeBar` and `PriceTicker` as reusable components; consider a lightweight `PairCard` for book/positions.
- **D7. shadcn/ui primitives installed but unused by the dashboard.** `Button`/`Card`/`Badge`/`Tabs`/`Tooltip`/`Dialog`/`Sheet` exist, but the only library consumer is `admin.tsx:15-17`. The dashboard hand-rolls `<button>` in `AppShell.tsx:241-248` (refresh), `PlanCard.tsx:325-346` ("Send to execution"), `account.tsx:569-572` ("Save risk profile") — each re-derives hover/disabled/focus styling — and `<section className="rounded-lg border border-bd bg-bg1/60 …">` cards everywhere instead of the `Card` primitive. → Adopt `Button`/`Card` as the base (at minimum the three hand-rolled buttons) for consistent interaction states. Keep bespoke token-driven chips as-is.

### E. Security (material for a trading app)

- **E1. MT5 credentials stored as base64 in `sessionStorage`.** `auth.ts:8-10` does `sessionStorage.setItem(KEY, btoa(`${username}:${appPassword}`))`. Base64 is not encryption; any XSS/extension can read app passwords. → Prefer an httpOnly + Secure backend cookie for auth; at minimum, don't store the raw password and document the threat model.

---

## 3. Prioritized roadmap

**Phase 0 — Quick wins, low risk (do first; each is small + verifiable)**
- D1 `text-ok` token → Plan page gating becomes visible again. ✅ (commit 8400800)
- D2 MOCK badge on Plan (or global banner). ✅ (commit 8400800)
- D5 touch targets + `aria-label`s. ✅ (commit 8400800)
- B2 delete unused shadcn components (grep-confirm each). ⏳ (pending)
- B3/B4 delete dead exports (`fmtZAR`, `fmtUSC`, `BUILD_ID`, bare `APP_VERSION`, `getBackendUrl`). ✅ (commit 8400800)
- B6 delete `getSnapshot` alias. ✅ (commit 4fd078e)

**Phase 1 — Performance (mobile budget)**
- A1 lazy-load `TVChart` + `/analytics` recharts.
- A2 kill `TVChart` perpetual rAF.
- A3 `React.memo` + `useMemo` `PlanCard`.
- A4 CSS marquee for `HeaderTicker`.

**Phase 2 — Consolidation**
- B1 merge motion hooks → `useMotionNumber`.
- B5 shared `src/lib/symbols.ts`.
- B7 `useRotatingMessage` hook.
- B8/B9/B10 unify currency/price/trim helpers + `priceDecimals()`.
- D4 promote `DirectionBadge`/`StatusBadge`/`KeyStatus`/`MetaLabel` to `src/components/sniper/`; collapse `MetaPill`/`MetaChip`; reuse everywhere.
- D6 extract `RegimeBar` (from `-live.page.tsx:340-376`) + `PriceTicker` (from `AppShell` `HeaderTicker`); consider lightweight `PairCard`.
- D7 adopt shadcn `Button`/`Card` for the hand-rolled `<button>`/`<section>` cards (start with the 3 buttons in `AppShell`/`PlanCard`/`account`).

**Phase 3 — Architecture hardening**
- C1 Zod schemas + validate in `normalizers.ts`.
- C2 move `useStableUserTrades` reconciliation out of render.
- C3 reuse watchlist constants/normalizer.
- C4 resolve `nextCandleAt` contract drift.
- D3 tokenize hardcoded hexes.

**Phase 4 — Security**
- E1 replace base64 `sessionStorage` creds with httpOnly Secure cookie (or document threat model + stop storing raw password).

---

## 4. Verification

- `bun run lint` and `bun run build` must pass after each phase.
- `bun run test:focused` (or `bun x vitest run`) — existing colocated tests must stay green; add a test for the merged `useMotionNumber` and for `getFreshnessState()` returning `mock`.
- `bun x tsc --noEmit` (or `bun run build`) for type safety after C1/C3/C4.
- **Manual:** load `/plan` in `MOCK_MODE` → confirm MOCK badge + green `text-ok` positive state; DevTools Network throttled to Slow 3G → confirm `/charts` + `/analytics` are separate chunks; toggle OS `prefers-reduced-motion` → animations respect it.

## 5. Out of scope / Do Not Touch

- `wordpress/_archive/` (old WordPress plugin) — ignore entirely.
- Pine/MT5 parity logic and `phase4-gate` semantics — not part of this web review.
- `packages/contracts` schema *meaning* — C1 only adds validation, it does not change contract semantics.
- Dashboard *visual* redesign — this is a redundancy/quality pass, not a restyle.
