---
name: pine-mt5-fib-parity
description: Use when fib parity, Pine versus EA/backend mismatches, phase4-gate failures, anchors, AF/SF, HTF/LTF, chop block, or draw methods are under review.
---

# pine-mt5-fib-parity

Use when:
- The issue involves fib parity, Pine vs EA/backend mismatch, or `phase4-gate.json` failure.
- Anchor rules, AF/SF, HTF/LTF, chop block, or draw methods are under review.

Workflow:
1. Locate Pine source and backend/EA fib code.
2. Extract anchor rules and generation behavior.
3. Compare level generation, rounding, and normalization.
4. Compare session/timeframe rules.
5. Run the parity validator if available.
6. Categorize mismatches.
7. Create small implementation slices.

Expected output:
- Source files inspected.
- Rule differences and mismatch categories.
- Parity risk summary.
- Proposed patch slices.
- Verification command or reason none was run.
