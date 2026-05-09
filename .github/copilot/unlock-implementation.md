# /unlock-implementation

## Step 1 — Validate Artifacts

Check that BOTH files exist in the repository root:
- `copilot-research.md`
- `codex-plan.md`

If either is missing, respond:

```
❌ Cannot unlock.
Missing: [list missing files]
Complete the research/planning pipeline first.
```

## Step 2 — Remove Lock

Update `.smc-workflow-state.json`:

```json
{
  "workflow": "research-and-plan",
  "state": "READY_FOR_IMPLEMENTATION",
  "issue": "[same issue]",
  "editing_locked": false,
  "research_complete": true,
  "plan_verified": true
}
```

## Step 3 — Confirm

```
🔓 Editing unlocked.
State: READY_FOR_IMPLEMENTATION

Implementation may now proceed using codex-plan.md as the spec.
```
