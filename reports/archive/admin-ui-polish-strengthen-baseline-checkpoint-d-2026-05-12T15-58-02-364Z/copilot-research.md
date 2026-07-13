# SMC SuperFIB - Issue Research Report

### 1. Issue classification
- Severity: MEDIUM
- Category: data-contract
- Layer(s) affected: Dashboard-JS
- Phase impact: Phase 0
- Migration-blocking: No

### 2. Confirmed evidence
- `src/routes/admin.tsx` renders baseline/checkpoint status in a 6-column grid using `HealthCard` components with minimal visual distinction (text values "captured"/"pending" with green/yellow tones)
- Baseline and checkpoint age are displayed in separate `HealthCard` components with detail text, but not prominently in section headers
- Print/export formatting uses CSS media queries to hide interactive elements and style print sections with `soak-report-print-*` classes
- Error handling exists for soak report loading failures, with `panelError` banner and retry button functionality
- `CheckpointCard` component already implements stronger visual distinction between baseline/checkpoint with colored borders, badges, and lock icons
- Lucide React icons are imported and available (CheckCircle2, AlertTriangle, Flag, Lock, ShieldCheck, ClipboardList)

### 3. Root cause hypothesis
- The main status grid uses generic `HealthCard` components without icons or badges, making baseline vs checkpoint distinction subtle
- Age information is buried in card details rather than being prominently displayed in headers or badges
- Print formatting may not preserve evidence section structure during export
- Error handling exists but may not provide sufficiently explicit operator-facing status messages for `/admin/soak-report` route failures

### 4. Blast radius
- Affects only `/admin` route UI display
- No impact on backend data contracts or API endpoints
- Print/export functionality may produce poorly formatted reports
- Error visibility could affect operator ability to diagnose soak report issues

### 5. Regression surface
- Existing `CheckpointCard` component already has proper baseline/checkpoint distinction that should not be broken
- Print CSS rules should be preserved to maintain existing export functionality
- Error handling patterns should maintain existing AuthError redirect behavior

### 6. Resolution path options
- Path A: Enhance the main status grid with icons/badges and move age to prominent header positions
- Path B: Extend existing `CheckpointCard` styling patterns to the main grid cards
- Recommended: Path A - minimal changes to existing grid while adding visual clarity

### 7. Risk flags
- High-risk system involved: No
- Requires parity re-validation: No
- Migration-blocking: No
- Human review required before merge: No

### 8. Handoff package
- Epicentre files: `src/routes/admin.tsx`
- Inputs Codex must verify: Current visual distinction between baseline/checkpoint cards, print CSS effectiveness, error message clarity
- Open unknowns: Whether print formatting adequately preserves evidence sections, exact operator-facing error messages needed</content>
<parameter name="filePath">c:\Users\LEONNA\OneDrive\All Final Softwares\SMC SuperFib Dashboard\smcsmartfib-WebApp\reports\copilot-research.md