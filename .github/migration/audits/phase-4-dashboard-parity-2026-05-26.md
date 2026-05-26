# Phase 4 Dashboard Parity Audit

## Change under audit

Frontend-only admin soak workflow update to support Phase 4 30-day live soak selection and controlled baseline reset for new soak cycles.

## Parity surface reviewed

- Dashboard soak metadata parity with Phase 4 operator requirements from `PHASE4_TESTING_GUIDE.md`
- Preservation of backend-owned soak truth during admin page hydration and reset
- No changes to Pine formulas, MT5 engine logic, backend soak endpoint contracts, or checkpoint persistence schema

## Re-validated facts

- Phase 4 template duration is `30` days / `720` hours.
- Phase 4 corpus symbols match guide minimums exactly: `EURUSD`, `USDJPY`, `XAUUSD`.
- Persisted `PHASE_4_30_DAY` soak evidence now round-trips through admin report inference and baseline hydration.
- Resetting baseline capture is a local UI unlock only; it does not remove the prior backend baseline checkpoint from the rendered report before a new capture occurs.

## Validation run

- `npx vitest run src/routes/-admin.test.tsx` — PASS
- `npm run build` — PASS

## Known limitations

- Backend acceptance of `PHASE_4_30_DAY` was not verified in this patch and must be confirmed before live Phase 4 usage.
- Phase 4 checkpoint schedule labels were not introduced because the contract explicitly leaves that schedule unconfirmed.
