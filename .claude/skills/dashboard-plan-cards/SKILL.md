# dashboard-plan-cards

Use when:
- The issue involves plan cards, RR display, currency display, or lot warnings.
- The plan card UI or data contract appears incorrect.

Workflow:
1. Inspect the plan card data contract.
2. Inspect formatter and helper logic.
3. Confirm account‑symbol rules.
4. Patch display logic.
5. Add or update component tests.
6. Validate UI states.
7. **Pine ↔ MT5 Parity Check:** Verify that any Pine‑derived fib levels used in the plan card match the MT5 backend calculations. Use the `pine-mt5-fib-parity` skill to generate a comparison report.
8. **Connection Validation:** Ensure the dashboard can retrieve the latest account and symbol data via the backend API (health‑check endpoint `/api/status`). Log any latency or error codes.
9. **UI Validation Checklist:**
   - Capture a screenshot of the updated plan card in both account‑currency and user‑local‑currency modes.
   - Verify RR values are within expected ranges for the given symbol.
   - Confirm lot‑size warnings respect symbol‑specific minimums.
   - Record the UI state in `reports/plan-card-validation.md`.

Expected output:
- Data source inspected.
- Formatter or helper changes.
- Component test path or manual validation path.
- Screenshot/state checklist if UI changed.
- Parity comparison report (if applicable).
- Connection health‑check log snippet.
- Updated `reports/plan-card-validation.md` documenting the UI verification steps.
