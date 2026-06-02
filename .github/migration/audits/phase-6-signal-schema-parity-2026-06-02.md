# Executive Summary

- Overall Parity: 100% for the validator and display-schema guards exercised in this run.
- Threshold Required: 95%.
- Pass/Fail: PASS for backend signal schema parity checks.
- Trend: Stable after restoring active plugin schema coverage.

# Component Parity Metrics

## Fib Engine

| Metric | Pine Value | MT5/Backend Value | Match | Accuracy |
|--------|------------|-------------------|-------|----------|
| Fib ingestion schema | 16-ratio contract | Active backend PHP tests | Yes | 100% |
| Fib parity regression | Pine reference tests | Backend fib parity tests | Yes | 100% |

## Regime Engine

| Metric | Pine Classification | MT5 Classification | Match | Accuracy |
|--------|---------------------|--------------------|-------|----------|
| Keyed `regimes` payload extraction | Present | Present | Yes | 100% |
| Missing counterpart gate | FAIL expected | FAIL emitted | Yes | 100% |

## Signal Engine

| Metric | Pine Signal | MT5/Backend Signal | Match | Accuracy |
|--------|-------------|--------------------|-------|----------|
| Keyed `signals` payload extraction | Present | Present | Yes | 100% |
| EA `candidates` payload extraction | Present | Present | Yes | 100% |
| Bare-array payload extraction | Present | Present | Yes | 100% |
| MT5-only counterpart gate | NO_PINE expected | FAIL emitted | Yes | 100% |
| Pine-only counterpart gate | NO_MT5 expected | FAIL emitted | Yes | 100% |
| Display schema `backend_confirmed` guard | Required | Present in active plugin SQL | Yes | 100% |

# Critical Issues Found

| Issue | Severity | Count | Resolution | Blocker |
|-------|----------|-------|------------|---------|
| Display schema guard skipped when active versioned plugin path replaced canonical local path | MEDIUM | 1 | Added plugin file resolver and hard assertion before schema check | No |

# Acceptable Drift Items

| Item | Difference | Reason | Accepted |
|------|------------|--------|----------|
| Dashboard Vitest verification | Not run to completion | Local esbuild child-process spawn denied with `EPERM` before tests loaded | Temporarily, pending CI/local environment rerun |

# Recommendations

1. Keep the restored schema assertion in the parity validator regression harness.
2. Rerun `npm run test:focused` in CI or a local session where esbuild can spawn.
3. Keep versioned plugin replacement staging separate from this harness patch.

# Verification Checklist

- [x] Parity computed across validator wrapper cases.
- [x] Missing counterpart gates validated.
- [x] Active backend display schema validated.
- [x] Multi-layer backend PHP regression suite completed.
- [x] MT5 include check completed.
- [ ] Vite-dependent dashboard tests completed.

# Artifacts

- Bug sweep report: `.github/docs/BUG_SWEEP_REPORT_2026-06-02.md`
- Patch: `scripts/test-parity-validator-regression.php`
