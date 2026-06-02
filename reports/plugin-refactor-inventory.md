# Plugin Refactor Inventory (Phase 0)

Generated: automated scan (Phase 0) and current refactor status

Summary:
- Plugin bootstrap wrapper: `wordpress/smc-superfib-sniper/smc-superfib-sniper.php` (small bootstrap file, delegating to legacy REST runtime)
- Namespaced autoloader: `wordpress/smc-superfib-sniper/includes/Autoloader.php`
- Compatibility wrapper: `wordpress/smc-superfib-sniper/includes/Plugin.php`
- Legacy runtime entrypoint: `wordpress/smc-superfib-sniper/includes/Legacy_SMC_SuperFib_Sniper_REST.php`
- Legacy market-data helper: `wordpress/smc-superfib-sniper/class-market-data-service.php`
- New service wrappers: `wordpress/smc-superfib-sniper/includes/Service/*.php`
- REST helpers and route support: `wordpress/smc-superfib-sniper/includes/Rest/*.php`

REST routes are still registered through the legacy runtime via `Legacy_SMC_SuperFib_Sniper_REST::register_routes()` and `SMC\SuperFib\Rest\Routes::register_routes()`.

DB table name patterns discovered:
- All tables use the `wpup_smc_sf_` prefix (search token `wpup_smc_sf_` present in the runtime code).

Cron hooks found:
- `smc_sf_prune_tables` (daily)
- `smc_sf_refresh_fundamentals` (twicehourly)

Activation / deactivation:
- `register_activation_hook` / `register_deactivation_hook` are now registered in the bootstrap wrapper.

Auth error shape (verified):
- `new WP_Error('smc_sf_auth_required', 'Authentication required.', array('status' => 401))` is still used in the legacy runtime.

Compatibility shims / requires:
- `class-market-data-service.php` is still required by legacy runtime.
- The plugin bootstrap now loads the namespaced autoloader and then forwards booting to the legacy compatibility class.

Reflection usage (tests reflect private methods on the legacy runtime):
- `ReflectionMethod` usage is present in test files, showing strong coupling to runtime internals. See `reports/plugin-refactor-blast-radius.md` for details.

Files of interest (quick links):
- [Plugin bootstrap](wordpress/smc-superfib-sniper/smc-superfib-sniper.php)
- [Legacy runtime](wordpress/smc-superfib-sniper/includes/Legacy_SMC_SuperFib_Sniper_REST.php)
- [Autoloader](wordpress/smc-superfib-sniper/includes/Autoloader.php)
- [Service wrappers](wordpress/smc-superfib-sniper/includes/Service/)
- [REST helpers](wordpress/smc-superfib-sniper/includes/Rest/)
- [Tests folder](wordpress/smc-superfib-sniper/tests/php/)

Notes / next steps:
- Baseline `php -l` validation is complete for the current bootstrap and legacy runtime.
- The core refactor task now is to extract route handlers and business logic out of `Legacy_SMC_SuperFib_Sniper_REST.php` into namespace-aware service classes.
- Preserve the current compatibility wrapper API while migrating internals, so tests and existing REST contracts remain stable.
- Refresh `reports/plugin-refactor-blast-radius.md` after the next extraction pass to capture the new test coupling surface.
- Target the following migration groups first:
  - REST route callbacks and permission handlers
  - cron scheduling and activation/deactivation bootstrap
  - CORS handling and REST settings bootstrapping
  - table schema / database helper delegation
- After extraction, run the phase 0 acceptance tests again and update this inventory with any new coupling or contract issues.

(scan produced by automated Phase 0 scannenvironment)
## Phase 0 Baseline — Syntax checks

- `php -l wordpress/smc-superfib-sniper/smc-superfib-sniper.php` — No syntax errors detected
- `php -l wordpress/smc-superfib-sniper/includes/Legacy_SMC_SuperFib_Sniper_REST.php` — No syntax errors detected

## Phase 0 Baseline — Tests summary

Ran all PHP test files under `wordpress/smc-superfib-sniper/tests/php/`. Most contract tests passed; one failing test observed during this baseline run:

- `test-progressive-lot-sizing.php` — failure: "GBPUSD lot mismatch for e1 expected=0.28 actual=0"

See `reports/plugin-refactor-blast-radius.md` for test coupling details and exact test file list.
