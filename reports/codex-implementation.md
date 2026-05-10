# Issue summary

The repository had version drift across the dashboard stack metadata: `package.json`, `package-lock.json`, `src/lib/version.ts`, the WordPress plugin header/constant, and the WordPress plugin README were still on `13.0.1` while Pine had already advanced independently to `v13.1.3`. The root `README.md` was also missing.

# Root cause implemented

The stack release metadata had not been bumped after earlier patch work, and there was no root-level project overview documenting that the stack and Pine move on separate version tracks. I updated the stack metadata to `13.0.2`, preserved Pine at `v13.1.3`, and added a concise root README that documents that separation explicitly.

# Exact files changed

- `package.json`
- `package-lock.json`
- `src/lib/version.ts`
- `wordpress/smc-superfib-sniper/smc-superfib-sniper.php`
- `wordpress/smc-superfib-sniper/README.md`
- `README.md`
- `reports/codex-implementation.md`

# Tests run

- `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version)"` -> `13.0.2`
- `node --input-type=module -e "import('./src/lib/version.ts').then((m) => console.log(m.APP_VERSION_LABEL))"` -> `v13.0.2`
- Root lockfile verification for `package-lock.json` top-level and `packages[""].version` -> `13.0.2`
- `npx --no-install tsc --noEmit --pretty false`
- `npm run build`
- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php`

No existing PHP test suite or Composer manifest was present in the repository paths searched, so `composer test` / `phpunit` could not be run from an established harness.

# Reports generated

- `reports/codex-implementation.md`

No bug sweep report was required because this patch does not affect runtime integrity, stale-data paths, wiring, or backend/dashboard truth.

No parity audit was required because Pine and trading logic were intentionally left unchanged.

# Remaining risks

- Manual browser verification of the dashboard footer version label was not run in this implementation pass.
- There is still no automated repository-level guard enforcing future stack-version consistency; the contract’s suggested script check conflicted with the `package.json` guard rails for this patch.

# Any contract ambiguities resolved during implementation

- The plan suggested branch `codex/version-consistency-bump-13-0-2`, but runtime context required `codex/version-inconsistency-pine-indicator-is-at-v13-1`. I used the runtime branch because it was the explicit execution requirement.
- The plan suggested adding an npm/CI version-consistency check, but the `package.json` contract also restricted that file to changing only the top-level `version` field. I took the smallest safe interpretation and did not add the extra script.
- The required branch already existed remotely, and unrelated local work in the primary checkout prevented an in-place branch switch. I used a separate git worktree on the required branch to avoid overwriting or stashing unrelated user changes.
