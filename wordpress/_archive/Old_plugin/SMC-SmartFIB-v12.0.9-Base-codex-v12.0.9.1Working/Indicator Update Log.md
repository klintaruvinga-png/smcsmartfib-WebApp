# SMC SuperFib Indicator Update Log

## Indicator
- Name: SMC SuperFib
- Current semantic version: v12.0.9.1
- Pine compiler directive: `//@version=6`

## Version history
- v12.0.9.1: Align Pine auto session mapping with dashboard runtime, include fib timeframe context in alerts, and preserve full F1/F2/F3 backend anchor contract.
- v11.0: Unified TradingView webhook envelope standardization and backend ingress compatibility update.
- v10.16.1: Version normalization, inline-comment migration, and context stack minimize UI toggle.

## v12.0.9.1 changes
- Aligned auto session selection with dashboard runtime profiles: 1H and below = Daily, 4H and below = Weekly, 1D and below = Monthly, higher = Yearly.
- Added `session_tf` and `fib_timeframe` to TradingView alert payloads.
- Preserved F1/F2/F3 anchor payload fields for backend/dashboard parity.

## v11.0 changes
- Standardized all TradingView `alert()` payloads to a unified envelope for one-endpoint ingestion:
  - `event_source: "tradingview"`
  - `event_version: "tv1"`
  - `event_type` (`REGIME` or `SIGNAL`)
  - shared instrument/time context fields (`instrument_id`, `symbol`, `display_symbol`, `pair`, `timestamp`, `timeframe`)
- Added `event_type: "REGIME"` envelope support on regime-change alert payloads while preserving existing regime fields used by backend handlers.
- Added `event_type: "SIGNAL"` envelope support on:
  - `NEW_LADDER`
  - `LADDER_UPDATE`
  - `EF_PRE_TRIGGER`
- Preserved all existing ladder/EF/regime backend-dependent fields while making payload shape consistent for `/wp-json/sniper/v1/tv-alert`.

## v10.16.1 changes
- Normalized indicator semantic version references to `v10.16.1` and centralized the build identifier in `INDICATOR_BUILD`.
- Updated header rendering to use `SMC SuperFIB v10.16.1 TP Gate` with state marker:
  - Expanded: `[−]`
  - Minimized: `[+]`
- Added `Minimize Context Stack` setting input to switch between full context stack rendering and header-only rendering.
- Implemented dual persistent table rendering strategy:
  - Full multi-row context table for expanded mode.
  - Compact header-only table for minimized mode.
- Added active/inactive table clearing so hidden mode does not leave ghost rows.

## Migrated implementation notes
- EF TP extension lines and TP labels remain gated by narrative validation state.
- SL reference visualization remains aligned to the same narrative gate used by TP rendering.
- HTF PDA, sweep state, displacement state, and EF source rows remain presentation outputs driven by existing computed state.
- This patch is presentation/versioning focused and does not alter signal/scoring/state-machine calculations.

## Known Pine UI constraints
- Pine Script tables do not support true click handlers on table headers/cells.
- Collapse behavior is implemented through the `Minimize Context Stack` input toggle in settings rather than click-to-collapse interaction.
