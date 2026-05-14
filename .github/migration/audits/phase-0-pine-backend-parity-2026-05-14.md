# Phase 0 Pine Backend Parity Audit

Date: 2026-05-14
Scope: PHP backend parity with `SMC_SuperFib_v13.1.3.pine`

## Pine rules implemented

- Session ladder from Pine lines `11-25`:
  - `<= 1800s -> Daily`
  - `<= 3600s -> Weekly`
  - `<= 14400s -> Monthly`
  - `<= 86400s -> Quarterly`
  - `else -> Yearly`
- Session-key semantics from Pine lines `487-497`.
- Completed-session roll-forward semantics from Pine lines `552-579` and `598-629`.
- Recency numbering from Pine lines `657-673`.
- Compression guard from Pine lines `675-687` and the threshold definition at line `195`.
- SuperFib recency weights from Pine lines `818-841`.
- Composite anchor math from Pine lines `845-867`.

## Backend changes audited

- `wordpress/smc-superfib-sniper/class-market-data-service.php`
  - Added `resolve_session_anchors(array $candles, int $chart_tf_seconds): array`
  - Added `resolve_htf_authority_anchor(array $candles, int $chart_tf_seconds): array`
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
  - Replaced raw-window fib anchoring with Pine-compatible session-anchor weighting.
  - Added additive `HTF_AF` response output while preserving existing `fibLevels`.
  - Added INFO-level anchor/composite logging for chart fib calculations.
  - Increased the hidden fib-history read window while keeping chart response candles capped at 120.

## Deterministic parity results

| Symbol | TF | Expected LTF composite | Expected HTF_AF anchor | Result |
| --- | --- | --- | --- | --- |
| EURUSD | 15min | H=61.5 L=6.15 | H=20 L=2 | pass |
| EURUSD | 1h | H=61.5 L=6.15 | H=20 L=2 | pass |
| EURUSD | 1day | H=61.5 L=6.15 | H=30 L=3 | pass |
| USDJPY | 15min | H=61.5 L=6.15 | H=20 L=2 | pass |
| USDJPY | 1h | H=61.5 L=6.15 | H=20 L=2 | pass |
| USDJPY | 1day | H=61.5 L=6.15 | H=30 L=3 | pass |
| XAUUSD | 15min | H=61.5 L=6.15 | H=20 L=2 | pass |
| XAUUSD | 1h | H=61.5 L=6.15 | H=20 L=2 | pass |
| XAUUSD | 1day | H=61.5 L=6.15 | H=30 L=3 | pass |

All deterministic parity assertions were validated in `wordpress/smc-superfib-sniper/tests/php/test-fib-parity.php` to `<= 0.00001` tolerance across the full 16-ratio set for both `LTF_SF` and `HTF_AF`.

## Manual parity still required

- TradingView Pine vs backend API comparison for at least three live symbols.
- Session rollover verification at a real session boundary.
- Soak verification that `HTF_AF` does not repaint mid-session.

## Notes

- The backend does not currently expose Pine compression inputs as runtime settings. This patch uses the Pine v13.1.3 defaults encoded in source:
  - non-JPY minimum: `20` pips
  - JPY minimum: `40` pips
- No fib-specific cache layer was found, so no dedicated fib-cache invalidation artifact was required.
