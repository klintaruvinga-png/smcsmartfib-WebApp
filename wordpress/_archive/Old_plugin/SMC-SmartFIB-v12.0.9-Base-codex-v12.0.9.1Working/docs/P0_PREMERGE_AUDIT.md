## Phase 0 Pre-Merge Audit

Status: Archived historical pre-merge note. This document targets the v10 merge baseline and is not the current v12.0.9.1 runtime contract.

Target: `SMC SuperFib Dashboard v10.0.0/SMC-SuperFib-Dashboard-codex-version`

Reference: `SMC SuperFib Dashboard v9.0.4/SMC SuperFib Engine`

Generated inventory: [docs/p0-function-diff.csv](/C:/Users/LEONNA/OneDrive/Test%20Plugins/SMC%20SuperFib%20Dashboard/SMC%20SuperFib%20Dashboard%20v10.0.0/SMC-SuperFib-Dashboard-codex-version/docs/p0-function-diff.csv)

The CSV above is the exhaustive function inventory used for this merge. It contains one row per named function found in the compared PHP and JS modules, with `BACKPORT` / `MERGE` / `PRESERVE` actions assigned before implementation.

### P0-A Diff Audit + Branch Map

| Function/module                                  | v9.0.4 state                                     | v10.0.0 state                                         | Action     |
| ------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------- | ---------- |
| `sniper_exe_timeframe_profile()`                 | Present, functional                              | Missing                                               | `BACKPORT` |
| `sniper_exe_normalize_fib_timeframe()`           | Present                                          | Missing                                               | `BACKPORT` |
| `sniper_exe_pip_value()`                         | Present with expanded pair map                   | Present with reduced pair map                         | `MERGE`    |
| `sniper_serve_dashboard()` module bootstrap      | Loads `core + data + planner + dashboard`        | Loads `dashboard` only                                | `MERGE`    |
| `sniper_handle_signal()` schema validation       | Basic normalization                              | Hardened alias/enrichment support                     | `PRESERVE` |
| `sniper_receive_engine_batch()` expiry lifecycle | Absent                                           | Present via timestamp parsing and validity handling   | `PRESERVE` |
| `assets/js/sniper-dashboard-core.js`             | Present, authoritative consumer/utilities module | Missing                                               | `BACKPORT` |
| `assets/js/sniper-dashboard-planner.js`          | Present, dedicated planner module                | Missing                                               | `BACKPORT` |
| `assets/js/sniper-dashboard.js`                  | Bootstrap plus shell helpers                     | Monolith consumer, planner, and engine glue           | `REWRITE`  |
| `sniper-dashboard-data.js`                       | Asset module with runtime coupling               | Root-level engine module with broader compute surface | `MERGE`    |

Branch for checkpoints: `codex/true-superset-v10`

### P0-B Canonical PHP to JS Contract

There are two contracts that must stay aligned:

1. `window.SNIPER` boot payload from `sniper-webhook.php`
2. Canonical signal payload from `sniper-execution-engine.php` into the dashboard bridge

#### Boot Payload

```json
{
	"version": "10.0.0",
	"rest_url": "string",
	"nonce": "string",
	"wp_base": "string",
	"fib_timeframe": "YEARLY|MONTHLY|WEEKLY|DAILY",
	"user_account": {
		"id": "integer",
		"display_name": "string",
		"email": "string",
		"logout_url": "string",
		"is_admin": "boolean"
	}
}
```

Rules:

- `fib_timeframe`, `nonce`, `rest_url`, and `user_account` are required before any JS module initializes.
- Server secrets such as backend webhook credentials or market-data API keys must stay server-side and must not be injected into `window.SNIPER`.
- `window.SNIPER.user` is deprecated in favor of `window.SNIPER.user_account` and may only remain as a compatibility alias during the merge.

#### Canonical Signal Payload

```json
{
	"signal_id": "string",
	"pair": "string",
	"direction": "BUY|SELL",
	"state": "INVALID|WATCHLIST|READY|ACTIVE|EXPIRED",
	"entry": {
		"zone_price": "number|null",
		"label": "string|null",
		"ladder": ["number"]
	},
	"sl": "number|null",
	"tp": {
		"primary": "number|null",
		"secondary": "number|null",
		"final": "number|null"
	},
	"lot_size": {
		"stages": ["number"],
		"total": "number|null"
	},
	"risk_amount": {
		"usc": "number|null",
		"zar": "number|null",
		"dd_impact_pct": "number|null"
	},
	"regime": "string|null",
	"fib_timeframe": {
		"key": "YEARLY|MONTHLY|WEEKLY|DAILY",
		"candleInterval": "string",
		"historyDepth": "integer",
		"proximityThreshold": "number",
		"strategyHorizon": "string"
	},
	"validity_bars_remaining": "integer",
	"enrichment_meta": {
		"sequence_status": "string|null",
		"setup_quality": "number|null",
		"execution_quality": "number|null",
		"rank_score": "number|null",
		"rr_estimate": "number|null",
		"chop": "object|null",
		"source": "string|null",
		"aliases_applied": ["string"]
	}
}
```

#### Alias Mapping and Deprecations

| Existing field     | Canonical destination               | Merge rule                                                  |
| ------------------ | ----------------------------------- | ----------------------------------------------------------- |
| `signal_state`     | `state`                             | Compatibility alias only; backend derives canonical `state` |
| `zone_price`       | `entry.zone_price`                  | Alias                                                       |
| `entry_zone_price` | `entry.zone_price`                  | Alias                                                       |
| `entry_zone_label` | `entry.label`                       | Alias                                                       |
| `entries`          | `entry.ladder`                      | Alias                                                       |
| `tp1`              | `tp.primary`                        | Alias                                                       |
| `tp2`              | `tp.secondary`                      | Alias                                                       |
| `tp`               | `tp.final`                          | Alias when `tp.final` absent                                |
| `total_risk_usc`   | `risk_amount.usc`                   | Alias                                                       |
| `total_risk_zar`   | `risk_amount.zar`                   | Alias                                                       |
| `dd_impact_pct`    | `risk_amount.dd_impact_pct`         | Alias                                                       |
| `session_tf`       | `enrichment_meta.source_session_tf` | Preserve as meta only; not canonical timeframe              |
| `user` boot key    | `user_account`                      | Deprecated compatibility alias                              |

No field from either version may be silently dropped. Anything not represented above must either map into `enrichment_meta` or be explicitly removed during cleanup.

### P0-C Authority Map

| Concern                 | Authoritative owner                                                  | Consumers                                                                                                 |
| ----------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Signal state derivation | `sniper-execution-engine.php`                                        | `sniper-dashboard-data.js`, `assets/js/sniper-dashboard-core.js`, `assets/js/sniper-dashboard-planner.js` |
| Fib timeframe profile   | `sniper-execution-engine.php` plus `sniper-dashboard-data.js` bridge | `assets/js/sniper-dashboard-core.js`                                                                      |
| Candle fetch profile    | `sniper-dashboard-data.js`                                           | `assets/js/sniper-dashboard-core.js`                                                                      |
| Symbol resolution       | `assets/js/sniper-dashboard-core.js`                                 | `sniper-dashboard-data.js`, planner/bootstrap                                                             |
| State rendering         | `assets/js/sniper-dashboard-core.js`                                 | `assets/js/sniper-dashboard.js`                                                                           |
| Trade planning logic    | `assets/js/sniper-dashboard-planner.js`                              | `assets/js/sniper-dashboard.js`                                                                           |
| Bootstrap and init      | `assets/js/sniper-dashboard.js`                                      | none                                                                                                      |

Merge rule: if logic for one concern exists outside its owner, move it to the owner and delete the duplicate.

### Checkpoint Plan

| Checkpoint   | Commit intent                                               |
| ------------ | ----------------------------------------------------------- |
| P0           | Audit artifacts committed before runtime changes            |
| After Step 2 | Boot payload plus execution engine contract merged          |
| After Step 4 | Module ownership restored and duplicated core logic removed |
| After Step 6 | Slim bootstrap finalized before cleanup and validation      |

Rollback policy: if Step 5 introduces planner or state regressions, reset work to the Step 4 checkpoint rather than rebuilding from zero.
