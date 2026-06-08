# ea-backend-bridge

Use when:
- The issue mentions heartbeat, market-stream, account-sync, symbol-sync, or license-check.
- EA logs and backend logs need comparison.
- Snapshot state or sync state is incorrect.

Workflow:
1. Confirm the EA log event.
2. Confirm the REST route receipt.
3. Confirm DB persistence.
4. Confirm the dashboard read path.
5. Identify the first broken layer.
6. Patch the smallest layer.
7. Verify end-to-end.

Expected output:
- Layer-by-layer status.
- The first broken layer.
- Minimal fix plan.
- Test or evidence commands.
