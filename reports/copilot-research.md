# SMC SuperFIB - Issue Research Report

## 1. Issue classification
- Severity: LOW
- Category: migration-governance
- Layer(s) affected: MT5 / PHP-backend / REST-API / Dashboard-JS / Pine / workflow
- Phase impact: Cross-phase

## 2. Confirmed evidence
- Current version references are inconsistent across the codebase
- Pine indicator file: `SMC_SuperFib_v13.1.3.pine` with build label "v13.1.3 - HTF F3 authority + level mirror patch"
- Package.json version: "13.0.1"
- Package-lock.json version: "13.0.1"
- WordPress plugin header version: "13.0.1"
- WordPress plugin constant VERSION: '13.0.1'
- Dashboard version.ts: APP_VERSION = "13.0.1"
- WordPress README.md references v13.0.1
- No root README.md file exists in the repository
- Historical docs reference v13.0.0 in migration artifacts

## 3. Root cause hypothesis
- Version drift occurred during development iterations without centralized version management
- Pine indicator advanced to v13.1.3 while other components remained at v13.0.1
- Missing root documentation (README.md) for project overview and setup instructions
- Confirmed: Version inconsistencies exist
- Hypothesis: Lack of automated version bumping process led to manual updates missing some files

## 4. Blast radius
- All files containing version strings: Pine indicator, package.json, package-lock.json, WordPress plugin files, dashboard version.ts
- Potential impact on build processes, plugin updates, and user-facing version displays
- No parity surfaces affected as this is metadata only
- No stale-state or authority risks

## 5. Regression surface
- Existing version checks or comparisons in code that expect specific version formats
- Build scripts or deployment processes that reference version numbers
- User documentation or support references to current versions
- No existing tests appear to validate version consistency

## 6. Resolution path options
- Path A: Update all version references to v13.0.2 and create a basic README.md
- Path B: Implement centralized version management with a single source of truth
- Recommended: Path A - narrow correction to meet the immediate requirement without over-engineering

## 7. Risk flags
- High-risk system involved: No
- Requires parity re-validation: No
- Migration-blocking: No
- Human review required before merge: No

## 8. Handoff package
- Epicentre files: package.json, src/lib/version.ts, wordpress/smc-superfib-sniper/smc-superfib-sniper.php, SMC_SuperFib_v13.1.3.pine
- Inputs Codex must verify: All version references updated to v13.0.2, README.md created with project description
- Open unknowns: Whether Pine file should be renamed from v13.1.3 to v13.0.2 or just the internal version updated
