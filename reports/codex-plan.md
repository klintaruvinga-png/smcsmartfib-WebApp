# Gemini Implementation Plan: SMC Intake - Test the local automation loop

### 1. Issue validation

- **Confirmed**: The pipeline is currently stalled in the `PLANNING` state because the background watcher fails to execute `codex.cmd` (missing from PATH).
- **Confirmed**: Stale blocking artifacts like `.claude-hardening-blocked.json` from previous failed attempts are preventing clean retries for new issues.
- **Confirmed**: There is a significant testing gap: no end-to-end integration test exists to verify the full research-plan-implement-merge cycle.

### 2. Implementation contract

#### File: `scripts/pipeline-watcher.js`
- **Change**: Implement a robust `checkHealth()` function that verifies the availability of `codex` and `gh` CLIs, as well as writability of the `reports/` and `reports/archive/` directories.
- **Change**: Update `startPipelineWatcher()` and `evaluatePipeline()` to call `checkHealth()` before attempting AI-driven transitions.
- **Change**: Introduce an internal "Mock Mode" (triggered by `PROCESS_ENV.PIPELINE_MOCK === 'true'`) that bypasses live CLI calls and synthesizes successful/failed artifacts for testing purposes.
- **Guard rails**: Do not modify the core state machine transitions in `.smc-workflow-state.json`.
- **Acceptance criterion**: The watcher should log a clear error and enter a "BLOCKED" state (with a notification) if a required dependency is missing, rather than crashing or silent looping.

#### File: `scripts/pipeline-watcher.test.mjs`
- **Change**: Add an integration test suite that utilizes "Mock Mode" to exercise the full state machine from `IDLE` through `IMPLEMENTATION_COMPLETE`.
- **Acceptance criterion**: `npm run test:focused` must include and pass these integration steps.

### 3. Patch sequence

1. **Dependency Hardening**: Add health checks to `scripts/pipeline-watcher.js`.
2. **Mock Support**: Add `PIPELINE_MOCK` support to `scripts/pipeline-watcher.js` for CLI bypass.
3. **Integration Test**: Implement the full-cycle integration test in `scripts/pipeline-watcher.test.mjs`.
4. **Cleanup**: Ensure the watcher correctly clears stale `.claude-hardening-blocked.json` or `.codex-plan-hardening-blocked.json` when a new issue is detected (already partially implemented, will verify/harden).

### 4. Regression guards

- Existing unit tests in `scripts/pipeline-watcher.test.mjs` must remain green.
- The `reports/archive` logic must be verified to ensure no data is overwritten or lost during state transitions.
- Parity with `workflow-state.js` CLI must be maintained.

### 5. Non-goals

- Implementing a replacement for the `codex` CLI itself.
- Changing the authoritative nature of the local pipeline runner.
- Modifying MT5 or Pine codebases.

### 6. Risk assessment

- **Risk**: Mock mode might not perfectly reflect live CLI behavior, leading to false confidence in the integration test.
- **Mitigation**: Keep mock logic as close as possible to the shell command output observed in logs.
- **Risk**: Automated deletion of blocking artifacts might clear a legitimate "permanent" block.
- **Mitigation**: Only auto-clear if the issue slug or research hash has changed.

### 7. Test requirements

- **New Test**: `scripts/pipeline-watcher.test.mjs` -> "Integration: Full Cycle"
- **Manual Check**: Run `npm run pipeline:reset` and verify the watcher transitions to `IDLE` and archives current artifacts.

### 8. Implementation handoff

- **Branch naming**: `gemini/test-automation-loop`
- **Commit grouping**: 
  - `feat(pipeline): add health checks and mock mode support`
  - `test(pipeline): add full-cycle integration test`
- **Post-implementation state**: `READY_FOR_IMPLEMENTATION` with `editing_locked: false`.
