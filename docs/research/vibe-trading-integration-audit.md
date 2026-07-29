# Vibe-Trading → SMC SuperFIB Integration Audit

**Audited:** 2026-07-19
**Sources (verified by code inspection, not the secondary report):**

- `klintaruvinga-png/smcsmartfib-WebApp` — commit SHA/tag not recorded at audit time (local repo). Inspected files: `mt5/*.mqh`, `backend/src/**`, `CONTEXT.md`, `DESIGN.md`, `data/*.json`
- `HKUDS/Vibe-Trading` — commit SHA/tag not recorded at audit time (external clone). Inspected files: `pyproject.toml`, `agent/src/skills/**`, `agent/src/shadow_account/**`, `agent/backtest/engines/forex.py`, `agent/api_server.py`

> **Note:** Exact commit SHAs or tags for the inspected code should be recorded in future audits to ensure reproducibility. For `HKUDS/Vibe-Trading`, verify the specific commit against the upstream repository when implementing integration.

> **Important correction to the input report:** the supplied "deep research report" researched `smcsmartfib-WebApp` but described it as a _vague Python/JS app with unknown internals_. That is wrong. The repo is a mature **TanStack Start (React/TS) + Nitro backend + Supabase + MT5 EA** stack that **already implements** symbol normalization, a regime/bias engine, an SMC fib engine (LTF*SF + HTF_AF), and a confidence-tiered signal engine. Large portions of the report's "Superfib needs X" framing are therefore misdirected. This audit re-bases the integration analysis on the \_actual* code.

---

## 1. What SuperFIB already has (do NOT rebuild)

| Capability                                              | Where                                                                 | Notes                                                                                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Symbol normalization (suffix strip + broker alias map)  | `mt5/SymbolNormalizer.mqh`                                            | 28+ known symbols, `.MICRO/.PRO/.ECN` suffix stripping, `GOLD→XAUUSD`, `US500→SPX500` aliases. **This already covers the report's "Point 3 — symbol normalization."** |
| PIP mapping                                             | `mt5/SignalEngine.mqh` `GetPipSize()`                                 | JPY pairs `0.01`, others `0.0001`. Inline, not centralized.                                                                                                           |
| HTF bias / LTF regime / chop score                      | `mt5/RegimeEngine.mqh`                                                | D1 EMA-20 bias (BULL/BEAR/TRANSITIONAL), H1 ATR-14 efficiency-ratio chop score. **This already covers the report's "SMC bias filter."**                               |
| SMC fib levels (LTF_SF recency-weighted + HTF_AF)       | `mt5/FibEngine.mqh`                                                   | Anchored sessions, compression threshold, parity-validated vs Pine.                                                                                                   |
| Signal lifecycle (WATCH→ARMED→READY, A+/A/B/C verdicts) | `mt5/SignalEngine.mqh`                                                | HTF alignment boost/penalty, MIN_RR=2.0, confluence bands.                                                                                                            |
| Market-data + fib REST routes                           | `backend/src/lib/market-data/handlers.ts`, `routes/api/**`            | Zod-validated, WordPress-compatible shape, grouped by timeframe/family.                                                                                               |
| Per-signal risk allocation                              | `wordpress/.../class-settings-service.php` `sanitize_risk_allocation` | Ladder-leg SL sizing. **Not** portfolio allocation.                                                                                                                   |

**Implication:** Features 2 (SMC) and 3 (PIP/symbol normalization) from the brief are _largely already solved inside SuperFIB_. The integration value is not "add SMC to Superfib" — it is "extend and harden what exists, and fill the genuine gaps" (portfolio, backtest, AI, account mgmt).

---

## 2. Genuine gaps in SuperFIB that Vibe-Trading fills

SuperFIB **already has** per-signal risk allocation (`wordpress/smc-superfib-sniper/class-settings-service.php` `sanitize_risk_allocation`: `perTradePct`, `dailyMaxPct`, `ddCapPct`) and ladder-leg stop-loss sizing logic (`mt5/SignalEngine.mqh` `ComputeSwingSL`: H4 swing-fractal SL placement with pip-based buffer). What is **absent** (verified by inspection of `backend/src/routes/api/**/*.ts` and grep for `portfolio|backtest|position.?size|kelly|risk.?parity|rebalanc|shadow` in backend/MT5 entry points) is:

| Gap                                                                                                | Vibe-Trading asset (verified)                                                                                                                                                                                         | Reuse path                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Portfolio-level allocation and position-sizing** (not per-signal risk caps, which already exist) | `skills/asset-allocation` — 5 optimizers (`equal_volatility`, `risk_parity`, `mean_variance`, `max_diversification`, `turnover_aware`) + MPT/Black-Litterman/risk-budgeting/all-weather theory + rebalancing triggers | Port the optimizer math into a TS/Python service behind a new `/api/portfolio` route. **Highest-value pull for your long-term buy/hold method.**                                       |
| **Backtesting (spread/swap/pip-accurate)**                                                         | `backtest/engines/forex.py` — FX spot/CFD engine, 24×5, spread-as-commission, 50:1–500:1 leverage, swap at daily close, `_pip_value()` JPY-aware, `_SPREAD_PIPS` table                                                | Wrap as a Python microservice; call from Nitro backend. Lets you validate SMC fib strategies historically.                                                                             |
| **Mine your own profitable trades into rules**                                                     | `src/shadow_account/` — `extractor.py` (FIFO pair → KMeans → decision tree → rules), `codegen.py` (rules→`signal_engine.py`+`config.json`), `reporter.py` (HTML/PDF)                                                  | Given your live MT5 journal/CSV, this extracts _your_ edge as code. Unique, high-value, offline-capable.                                                                               |
| **Strategy generation + evaluation**                                                               | `skills/strategy-generate` — parse intent → `config.json` + `signal_engine.py` contract → backtest → metrics.csv                                                                                                      | Authoring layer on top of the backtester.                                                                                                                                              |
| **SMC signal reference (ICT)**                                                                     | `skills/smc` — BOS/ChoCH/FVG/OB/liquidity logic via `smartmoneyconcepts` lib                                                                                                                                          | **Cross-check** against SuperFIB `SignalEngine`; align confluence/verdict definitions; do not duplicate MQL5 logic in Python needlessly.                                               |
| **Fundamentals / SEC filings**                                                                     | `skills/sec-edgar` (free, no key), `skills/fundamental-filter`, `skills/financial-statement`, `skills/valuation-model`                                                                                                | For the "fundamentals" half of AI analysis (Point 4). US equities only.                                                                                                                |
| **Sentiment / macro**                                                                              | `skills/sentiment-analysis` (fear/greed, put-call, social), `skills/global-macro`, `skills/geopolitical-risk`, `skills/correlation-regime`                                                                            | For the "technicals + sentiment" AI layer. Note: `sentiment-analysis` SKILL is **Chinese-market oriented** (A-share social/leverage flows) — partial fit for your FX/indices universe. |
| **Risk analysis**                                                                                  | `skills/risk-analysis`, `skills/volatility`, `skills/hedging-strategy`                                                                                                                                                | VaR/drawdown/hedge framing for account management.                                                                                                                                     |

---

## 3. Per-point verdict against your brief

**Point 1 — Hedge-fund features (long-term buy/sell/hold).** ✅ Strong fit. Vibe's `asset-allocation` skill is the single best pull: risk-parity / all-weather / turnover-aware optimizers map directly to a long-horizon hold method, and the rebalancing-trigger logic (periodic + threshold + volatility) is exactly what a hold strategy needs. SuperFIB has _zero_ of this. **Priority 1.**

**Point 2 — SMC concepts.** ⚠️ Mostly already in SuperFIB (`RegimeEngine`, `SignalEngine`, `FibEngine`). Vibe adds: (a) a **cross-check reference** (`skills/smc` + `smartmoneyconcepts`) to validate/extend your MQL5 SMC logic, and (b) **volume-profile / liquidity-heatmap / orderflow-proxy** concepts (`skills/liquidation-heatmap`, `market-microstructure`) you do _not_ have. Recommendation: don't re-implement SMC; **extend** with liquidity/volume-profile overlays and align verdict tiers with Vibe's BOS/ChoCH/FVG convention. **Priority 2 (extension, not build).**

**Point 3 — PIP mapping, symbol normalization.** ✅ SuperFIB already has both (`SymbolNormalizer.mqh`, `GetPipSize()`). What's missing: (a) a **centralized pip-size table** (currently inline in `SignalEngine`), and (b) **multi-venue GlobalID mapping** (the report's CoinAPI-style 3-tier ID). Vibe's `_normalize_symbol` in `backtest/engines/_market_hooks.py` shows the Python-side pattern. Recommendation: lift SuperFIB's existing alias map into a shared JSON config consumed by both MT5 and backend, add a pip-size column, and add Vibe-style venue symbols only if you add new data sources. **Priority 3 (hardening, low effort).**

**Point 4 — AI for fundamentals, technicals, account management.** 🟡 Partial, with caveats.

- _Fundamentals:_ real and usable via `sec-edgar` + `fundamental-filter` (US equities). For your FX/indices universe, fundamentals are macro-driven → use `global-macro` + `geopolitical-risk`, not EDGAR.
- _Technicals:_ your SMC engine already does the heavy lifting; AI adds **pattern/regime labeling** (`correlation-regime`, `ml-strategy` skills) — but the report's CNN/LSTM chart recognition is **high-effort, low-probability**; skip it initially.
- _Account management:_ `risk-analysis` + `shadow-account` (mine your journal) + a VaR/drawdown monitor is the right, achievable slice. **Avoid** the report's "RL/LLM trade-suggestion assistant" (flagged Very High risk, limited explainability) — it is not decision-grade for real capital.

**Point 5 — Other similar concepts.** Confirmed present in Vibe and useful: **multi-agent swarm** (`run_swarm` for parallel risk/sector analysis), **trade journal** (`skills/trade-journal`), **performance attribution** (`skills/performance-attribution`), **walk-forward/out-of-sample** (backtest engine), **execution modeling** (`skills/execution-model` — TWAP/VWAP; high effort, needs broker depth, deprioritize). Observability/CI patterns from Vibe's Docker + dependabot + CI grep-gates are worth copying into SuperFIB's repo hygiene.

---

## 4. Recommended pull order (highest ROI first)

| Rank | Feature                                                          | Source                                                 | Effort    | Why                                                           |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------ | --------- | ------------------------------------------------------------- |
| 1    | Portfolio allocation + rebalancing                               | `asset-allocation` skill                               | Med       | Directly serves long-term hold; zero existing equivalent      |
| 2    | Backtest microservice (FX)                                       | `backtest/engines/forex.py`                            | Med       | Lets you validate SMC fib strategies on history               |
| 3    | Shadow-account rule mining                                       | `shadow_account/*`                                     | Med       | Turns your live journal into coded edge                       |
| 4    | Centralized symbol+pip config                                    | SuperFIB `SymbolNormalizer` + Vibe `_normalize_symbol` | Low       | Hardens Point 3, removes inline duplication                   |
| 5    | SMC extension: liquidity/volume-profile overlays                 | `liquidation-heatmap`, `market-microstructure`         | Med       | Fills SMC gap SuperFIB doesn't have                           |
| 6    | Fundamentals/macro AI layer                                      | `sec-edgar`, `global-macro`, `fundamental-filter`      | High      | Point 4; scope to equities+macro, not FX micro                |
| 7    | Risk/account monitor (VaR, drawdown)                             | `risk-analysis`, `shadow-account`                      | Med       | Account management without the dangerous "AI trade suggester" |
| —    | CNN chart recognition / RL trade suggester / TWAP-VWAP execution | report-only                                            | Very High | **Deprioritize** — low prob, high risk, needs broker depth    |

---

## 5. Architecture note (recommended integration pattern)

SuperFIB is TS/Nitro/Supabase; Vibe is Python/FastAPI/DuckDB. The clean integration is **not** to merge repos. Stand up Vibe's quant modules as a **Python side-service** (FastAPI) behind SuperFIB's Nitro backend.

**Proposed Nitro public routes → internal FastAPI endpoints:**

- `/api/portfolio` → `POST /portfolio/optimize` (asset-allocation)
- `/api/backtest` → `POST /backtest/run` (backtest engines)
- `/api/shadow/mine` → `POST /shadow/mine` (shadow_account extractor)
- `/api/research/*` → `/research/*` (sec-edgar, global-macro, risk-analysis)

**Authentication contract:**

- Client calls Nitro public route with `Authorization: Bearer <jwt>` (for dashboard users) or `x-ea-api-key: <key>` (for MT5 EA).
- Nitro authenticates the caller using existing middleware (`backend/src/lib/auth/middleware.ts`: `requireAuth` / `requireEaAuth`).
- Nitro then calls the internal FastAPI service with a **separate service credential** (e.g., `Authorization: Bearer <service-token>` or `X-Service-Key: <internal-key>`), **NOT** by forwarding the client's JWT or API key.
- Nitro explicitly propagates caller identity in the FastAPI request body (e.g., `{"user_id": "...", "role": "..."}`) so the Python service has audit context.

**Request/response schemas:**

- `/api/portfolio` request: `{ "user_id": string, "symbols": string[], "constraints": { "max_position_pct": number, "rebalance_threshold": number }, "optimizer": "risk_parity" | "equal_volatility" | ... }`
- `/api/portfolio` response: `{ "allocations": { [symbol: string]: number }, "metrics": { "expected_return": number, "volatility": number }, "rebalance_needed": boolean }`
- `/api/backtest` request: `{ "user_id": string, "strategy_config": { ... }, "date_range": { "start": string, "end": string }, "symbols": string[] }`
- `/api/backtest` response: `{ "metrics": { "sharpe": number, "max_drawdown": number, "total_return": number }, "equity_curve": [...], "trades": [...] }`

**Timeouts and failure behavior:**

- Nitro → FastAPI calls: 30s timeout (configurable), retry once on 5xx, fail-fast on 4xx.
- On FastAPI service unavailable: Nitro returns `503 Service Temporarily Unavailable` to client with `Retry-After` header.

**Current state:** As of this audit (2026-07-19, commit ec847883), the FastAPI service and `/api/portfolio` route **do not yet exist** in the SuperFIB codebase. The above is the recommended integration contract for implementation. SuperFIB's existing Nitro auth middleware already handles `Authorization` and `x-ea-api-key` headers; the service-credential pattern is net-new.

---

## 6. What the input report got wrong (so we don't act on fiction)

1. Called SuperFIB "likely Python/Flask/Django/Streamlit, internals unknown." **False** — it's TanStack Start + Nitro + Supabase + MT5, and its internals _are_ known (read above).
2. Framed symbol normalization and SMC bias as things SuperFIB "should implement." **False** — both already exist in `SymbolNormalizer.mqh` and `RegimeEngine.mqh`.
3. Recommended building SMC from scratch via `smartmoneyconcepts`. **Misdirected** — SuperFIB's MQL5 SignalEngine already does SMC; Vibe's value there is _cross-check + extension_, not rebuild.
4. Pushed RL/LLM "trade suggestion" and CNN pattern recognition as features. **Over-reach** — both are flagged high-risk/low-probability even in the report's own tables; not decision-grade for real capital.
5. Treated "shadow account" as a Vibe-only novel analytic. **Correct** — and it's the most underrated high-value pull for _your_ workflow.

**Bottom line:** Pull Vibe's _quant backbone_ (allocation, backtest, shadow-mining, research skills) into a side-service. Do **not** rebuild SuperFIB's existing SMC/symbol/regime layers. Treat the report as a lead list, not a spec — several of its premises don't survive contact with the actual code.
