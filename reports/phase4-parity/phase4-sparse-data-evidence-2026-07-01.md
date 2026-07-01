# Phase 4 Sparse Data Evidence - 2026-07-01

## Live gate attempt

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-phase4-parity.ps1 -BackendMode pine_compatible -NoPrompt
```

Result: blocked before export.

Evidence:

```text
[parity] Resolving auth
FAIL Auth env vars SMC_WP_USER / SMC_APP_PW not set and -NoPrompt is active
```

No fresh backend fib export or M15 candle export was captured in this run.

## Existing artifact replay

The existing paired artifacts in `reports/phase4-parity/mt5-levels.json` and
`reports/phase4-parity/pine-levels.json` were replayed with the validator.

Full default gate:

```powershell
php scripts/parity-validator.php --mt5-file reports/phase4-parity/mt5-levels.json --pine-file reports/phase4-parity/pine-levels.json --out reports/phase4-parity/phase4-gate-2026-07-01_existing-artifacts.json --run-ts 2026-07-01T00:00:00Z
```

Result:

- Gate: FAIL
- Overall parity: 12.76%
- Total tuples: 384
- Exact matches: 34
- Critical mismatches: 335
- MT5 present tuples: 96
- Pine present tuples: 96
- Missing tuples per side: 288

M15-only replay:

```powershell
php scripts/parity-validator.php --mt5-file reports/phase4-parity/mt5-levels.json --pine-file reports/phase4-parity/pine-levels.json --out reports/phase4-parity/phase4-gate-2026-07-01_existing-artifacts-M15.json --run-ts 2026-07-01T00:00:00Z --timeframes M15
```

Result:

- Gate: FAIL
- Overall parity: 51.04%
- Total tuples: 96
- Exact matches: 34
- Acceptable drift: 15
- Critical mismatches: 47

## Lineage finding

The existing replay is not a clean Pine-compatible backend comparison. Anchor
debug shows MT5 levels came from endpoint/direct anchor windows while Pine levels
were rebuilt from exported M15 candles:

- MT5 direct windows include `00:14:59Z` to `23:59:59Z` day ranges.
- Pine derived windows include `00:00:00Z` to `23:45:00Z` day ranges.
- The current runner can flag this as `LINEAGE_MISMATCH` in Markdown reports
  when both sides provide lineage metadata.

This evidence supports the `Candle lineage mismatch` and `Sparse capture guard
miss` failure modes. It does not prove current `pine_compatible` backend parity
because the live authenticated export could not be run.

## Staleness evidence

Direct generator replay against current `data/` failed the staleness guard:

```text
FAIL: stale candles in EURUSD_M15.json - open=2026-06-04T13:29:58.000Z close=2026-06-04T13:44:58.000Z reference=2026-06-18T07:27:29.062Z age_from_close=1186951s max_age=900s
```

Fresh M15 export is required before the Phase 4 gate can prove completion.

## Code drift fixed

`scripts/generate-pine-levels-v13.cjs` had a compression threshold drift from
the Pine compression guard / PHP / MT5 parity lane. The generator now uses:

- EURUSD and XAUUSD class: 20 pips
- JPY class: 40 pips

Regression coverage was added in `scripts/generate-pine-levels-v13.test.mjs`.

