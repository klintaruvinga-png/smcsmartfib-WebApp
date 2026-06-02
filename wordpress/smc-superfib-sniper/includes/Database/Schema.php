<?php
namespace SMC\SuperFib\Database;

final class Schema {
    private static $display_signals_table_ready = false;

    public static function activate() {
        global $wpdb;

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charset = $wpdb->get_charset_collate();
        $tables = array();

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_user_settings (
            user_id BIGINT UNSIGNED NOT NULL,
            settings LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (user_id)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_integrations (
            user_id BIGINT UNSIGNED NOT NULL,
            provider VARCHAR(64) NOT NULL,
            encrypted_secret LONGTEXT NULL,
            key_status VARCHAR(32) NOT NULL DEFAULT 'missing',
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (user_id, provider)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_candles (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            symbol VARCHAR(24) NOT NULL,
            timeframe VARCHAR(16) NOT NULL,
            candle_time DATETIME NOT NULL,
            open DECIMAL(20,8) NOT NULL,
            high DECIMAL(20,8) NOT NULL,
            low DECIMAL(20,8) NOT NULL,
            close DECIMAL(20,8) NOT NULL,
            volume DECIMAL(24,8) NULL,
            source VARCHAR(20) NOT NULL DEFAULT 'twelve-data',
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY candle_lookup (user_id, symbol, timeframe, candle_time),
            KEY latest_symbol (user_id, symbol, timeframe, candle_time)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_snapshots (
            user_id BIGINT UNSIGNED NOT NULL,
            symbol VARCHAR(24) NOT NULL,
            bid DECIMAL(20,8) NOT NULL DEFAULT 0,
            ask DECIMAL(20,8) NOT NULL DEFAULT 0,
            mid DECIMAL(20,8) NOT NULL DEFAULT 0,
            spread INT NOT NULL DEFAULT 0,
            change_pct_1d DECIMAL(12,6) NOT NULL DEFAULT 0,
            source VARCHAR(20) NOT NULL DEFAULT 'twelve-data',
            state VARCHAR(32) NOT NULL DEFAULT 'offline',
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (user_id, symbol)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_engine_runs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            status VARCHAR(32) NOT NULL,
            summary LONGTEXT NOT NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_created (user_id, created_at)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_signals (
            id VARCHAR(64) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            symbol VARCHAR(24) NOT NULL,
            direction VARCHAR(8) NOT NULL,
            status VARCHAR(16) NOT NULL,
            verdict VARCHAR(4) NOT NULL,
            confluence LONGTEXT NOT NULL,
            engine LONGTEXT NOT NULL,
            backend_confirmed TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_symbol (user_id, symbol),
            KEY user_status (user_id, status)
        ) $charset;";

        $tables[] = self::get_display_signals_table_sql($charset);

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_trade_plans (
            signal_id VARCHAR(64) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            plan LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (signal_id),
            KEY user_updated (user_id, updated_at)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_trade_queue (
            id VARCHAR(64) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            signal_id VARCHAR(64) NOT NULL,
            payload LONGTEXT NOT NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'pending-sync',
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_state (user_id, state)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_account_snapshots (
            user_id BIGINT UNSIGNED NOT NULL,
            data LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (user_id)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_symbol_sync (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            account_id VARCHAR(64) NOT NULL DEFAULT '',
            terminal_id VARCHAR(96) NOT NULL DEFAULT '',
            broker VARCHAR(96) NOT NULL DEFAULT '',
            broker_server VARCHAR(128) NOT NULL DEFAULT '',
            broker_symbol VARCHAR(96) NOT NULL,
            normalized_symbol VARCHAR(64) NOT NULL DEFAULT '',
            base_symbol VARCHAR(64) NOT NULL DEFAULT '',
            visible TINYINT(1) NOT NULL DEFAULT 0,
            selected TINYINT(1) NOT NULL DEFAULT 0,
            digits INT NOT NULL DEFAULT 0,
            point DECIMAL(20,10) NOT NULL DEFAULT 0,
            contract_size DECIMAL(20,8) NOT NULL DEFAULT 0,
            trade_mode VARCHAR(64) NOT NULL DEFAULT '',
            min_lot DECIMAL(20,4) NOT NULL DEFAULT 0,
            max_lot DECIMAL(20,4) NOT NULL DEFAULT 0,
            lot_step DECIMAL(20,4) NOT NULL DEFAULT 0,
            spread DECIMAL(20,8) NOT NULL DEFAULT 0,
            currency_profit VARCHAR(32) NOT NULL DEFAULT '',
            currency_margin VARCHAR(32) NOT NULL DEFAULT '',
            last_seen_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            raw_json LONGTEXT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY user_account_terminal_symbol (user_id, account_id, terminal_id, broker_symbol),
            KEY user_account_terminal (user_id, account_id, terminal_id),
            KEY normalized_symbol (normalized_symbol)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_trade_positions (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            deterministic_key VARCHAR(191) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            account_id VARCHAR(64) NOT NULL DEFAULT '',
            terminal_id VARCHAR(96) NOT NULL DEFAULT '',
            position_id VARCHAR(64) NOT NULL DEFAULT '',
            symbol VARCHAR(96) NOT NULL DEFAULT '',
            normalized_symbol VARCHAR(64) NOT NULL DEFAULT '',
            direction VARCHAR(32) NOT NULL DEFAULT '',
            entry_price DECIMAL(20,8) NOT NULL DEFAULT 0,
            current_price DECIMAL(20,8) NOT NULL DEFAULT 0,
            sl DECIMAL(20,8) NOT NULL DEFAULT 0,
            tp DECIMAL(20,8) NOT NULL DEFAULT 0,
            volume DECIMAL(20,8) NOT NULL DEFAULT 0,
            profit DECIMAL(20,8) NOT NULL DEFAULT 0,
            swap DECIMAL(20,8) NOT NULL DEFAULT 0,
            commission DECIMAL(20,8) NOT NULL DEFAULT 0,
            magic BIGINT NOT NULL DEFAULT 0,
            comment TEXT NULL,
            opened_at DATETIME NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'open',
            ea_version VARCHAR(64) NOT NULL DEFAULT '',
            last_seen_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            raw_json LONGTEXT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY deterministic_key (deterministic_key),
            KEY user_state (user_id, state),
            KEY user_account_terminal (user_id, account_id, terminal_id)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_trade_orders (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            deterministic_key VARCHAR(191) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            account_id VARCHAR(64) NOT NULL DEFAULT '',
            terminal_id VARCHAR(96) NOT NULL DEFAULT '',
            order_id VARCHAR(64) NOT NULL DEFAULT '',
            symbol VARCHAR(96) NOT NULL DEFAULT '',
            normalized_symbol VARCHAR(64) NOT NULL DEFAULT '',
            order_type VARCHAR(32) NOT NULL DEFAULT '',
            direction VARCHAR(32) NOT NULL DEFAULT '',
            entry_price DECIMAL(20,8) NOT NULL DEFAULT 0,
            sl DECIMAL(20,8) NOT NULL DEFAULT 0,
            tp DECIMAL(20,8) NOT NULL DEFAULT 0,
            volume DECIMAL(20,8) NOT NULL DEFAULT 0,
            magic BIGINT NOT NULL DEFAULT 0,
            comment TEXT NULL,
            placed_at DATETIME NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'active',
            ea_version VARCHAR(64) NOT NULL DEFAULT '',
            last_seen_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            raw_json LONGTEXT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY deterministic_key (deterministic_key),
            KEY user_state (user_id, state),
            KEY user_account_terminal (user_id, account_id, terminal_id)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_account_telemetry (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            account_id VARCHAR(64) NOT NULL DEFAULT '',
            terminal_id VARCHAR(96) NOT NULL DEFAULT '',
            balance DECIMAL(20,8) NOT NULL DEFAULT 0,
            equity DECIMAL(20,8) NOT NULL DEFAULT 0,
            margin DECIMAL(20,8) NOT NULL DEFAULT 0,
            free_margin DECIMAL(20,8) NOT NULL DEFAULT 0,
            margin_level DECIMAL(20,8) NOT NULL DEFAULT 0,
            floating_pl DECIMAL(20,8) NOT NULL DEFAULT 0,
            currency VARCHAR(32) NOT NULL DEFAULT '',
            leverage BIGINT NOT NULL DEFAULT 0,
            ea_version VARCHAR(64) NOT NULL DEFAULT '',
            last_seen_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            raw_json LONGTEXT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY user_account_terminal (user_id, account_id, terminal_id),
            KEY user_last_seen (user_id, last_seen_at)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_trades (
            id VARCHAR(64) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            kind VARCHAR(16) NOT NULL,
            payload LONGTEXT NOT NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'live',
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_kind (user_id, kind)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_audit_events (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            event_type VARCHAR(64) NOT NULL,
            payload LONGTEXT NOT NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_event (user_id, event_type, created_at)
        ) $charset;";

        foreach ($tables as $sql) {
            dbDelta($sql);
        }

        self::ensure_display_signals_table();
        self::ensure_trade_telemetry_tables();
        self::ensure_soak_tables();

        return true;
    }

    public static function deactivate(): void {
        wp_clear_scheduled_hook('smc_sf_prune_tables');
        wp_unschedule_hook('smc_sf_prune_tables');
    }

    public static function ensure_display_signals_table() {
        global $wpdb;

        if (self::$display_signals_table_ready) {
            return true;
        }

        if (file_exists(ABSPATH . 'wp-admin/includes/upgrade.php')) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        if (!function_exists('dbDelta')) {
            return false;
        }

        if (is_object($wpdb) && property_exists($wpdb, 'last_error')) {
            $wpdb->last_error = '';
        }

        dbDelta(self::get_display_signals_table_sql($wpdb->get_charset_collate()));

        if (is_object($wpdb) && property_exists($wpdb, 'last_error') && $wpdb->last_error !== '') {
            return false;
        }

        self::$display_signals_table_ready = true;
        return true;
    }

    public static function get_display_signals_table_sql(string $charset): string {
        global $wpdb;

        return "CREATE TABLE {$wpdb->prefix}smc_sf_display_signals (
            id VARCHAR(64) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            symbol VARCHAR(24) NOT NULL,
            direction VARCHAR(8) NOT NULL,
            lifecycle_state VARCHAR(32) NOT NULL DEFAULT 'DISPLAY_ACTIVE',
            status VARCHAR(16) NOT NULL,
            verdict VARCHAR(4) NOT NULL,
            backend_confirmed TINYINT(1) NOT NULL DEFAULT 0,
            quality_score DECIMAL(10,4) NOT NULL DEFAULT 0,
            signal_family_key VARCHAR(128) NOT NULL,
            entry_price DECIMAL(20,8) NOT NULL,
            sl_price DECIMAL(20,8) DEFAULT NULL,
            tp_price DECIMAL(20,8) DEFAULT NULL,
            source_candidate_id VARCHAR(64) DEFAULT NULL,
            source VARCHAR(16) NOT NULL DEFAULT 'backend',
            entry_hit_at DATETIME DEFAULT NULL,
            stop_hit_at DATETIME DEFAULT NULL,
            replaced_by VARCHAR(64) DEFAULT NULL,
            invalidated_at DATETIME DEFAULT NULL,
            invalidation_reason VARCHAR(64) DEFAULT NULL,
            first_seen_at DATETIME NOT NULL,
            last_confirmed_at DATETIME NOT NULL,
            last_evaluated_at DATETIME NOT NULL,
            last_blueprint_at DATETIME DEFAULT NULL,
            expires_at DATETIME DEFAULT NULL,
            confluence LONGTEXT NOT NULL,
            engine LONGTEXT NOT NULL,
            PRIMARY KEY  (id),
            KEY user_active (user_id, lifecycle_state, quality_score),
            KEY user_symbol (user_id, symbol, lifecycle_state),
            KEY user_family (user_id, signal_family_key(64))
        ) $charset;";
    }

    public static function ensure_bridge_tables() {
        global $wpdb;

        if (file_exists(ABSPATH . 'wp-admin/includes/upgrade.php')) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        if (!function_exists('dbDelta')) {
            return false;
        }

        if (is_object($wpdb) && property_exists($wpdb, 'last_error')) {
            $wpdb->last_error = '';
        }

        $charset = $wpdb->get_charset_collate();
        $tables = array();

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_symbol_sync (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            account_id VARCHAR(64) NOT NULL DEFAULT '',
            terminal_id VARCHAR(96) NOT NULL DEFAULT '',
            broker VARCHAR(96) NOT NULL DEFAULT '',
            broker_server VARCHAR(128) NOT NULL DEFAULT '',
            broker_symbol VARCHAR(96) NOT NULL,
            normalized_symbol VARCHAR(64) NOT NULL DEFAULT '',
            base_symbol VARCHAR(64) NOT NULL DEFAULT '',
            visible TINYINT(1) NOT NULL DEFAULT 0,
            selected TINYINT(1) NOT NULL DEFAULT 0,
            digits INT NOT NULL DEFAULT 0,
            point DECIMAL(20,10) NOT NULL DEFAULT 0,
            contract_size DECIMAL(20,8) NOT NULL DEFAULT 0,
            trade_mode VARCHAR(64) NOT NULL DEFAULT '',
            min_lot DECIMAL(20,4) NOT NULL DEFAULT 0,
            max_lot DECIMAL(20,4) NOT NULL DEFAULT 0,
            lot_step DECIMAL(20,4) NOT NULL DEFAULT 0,
            spread DECIMAL(20,8) NOT NULL DEFAULT 0,
            currency_profit VARCHAR(32) NOT NULL DEFAULT '',
            currency_margin VARCHAR(32) NOT NULL DEFAULT '',
            last_seen_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            raw_json LONGTEXT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY user_account_terminal_symbol (user_id, account_id, terminal_id, broker_symbol),
            KEY user_account_terminal (user_id, account_id, terminal_id),
            KEY normalized_symbol (normalized_symbol)
        ) $charset;";

        foreach ($tables as $sql) {
            dbDelta($sql);
            if (is_object($wpdb) && property_exists($wpdb, 'last_error') && $wpdb->last_error !== '') {
                return false;
            }
        }

        return true;
    }

    public static function ensure_trade_telemetry_tables() {
        global $wpdb;

        if (file_exists(ABSPATH . 'wp-admin/includes/upgrade.php')) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        if (!function_exists('dbDelta')) {
            return false;
        }

        if (is_object($wpdb) && property_exists($wpdb, 'last_error')) {
            $wpdb->last_error = '';
        }

        $charset = $wpdb->get_charset_collate();
        $tables = array();

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_trade_positions (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            deterministic_key VARCHAR(191) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            account_id VARCHAR(64) NOT NULL DEFAULT '',
            terminal_id VARCHAR(96) NOT NULL DEFAULT '',
            position_id VARCHAR(64) NOT NULL DEFAULT '',
            symbol VARCHAR(96) NOT NULL DEFAULT '',
            normalized_symbol VARCHAR(64) NOT NULL DEFAULT '',
            direction VARCHAR(32) NOT NULL DEFAULT '',
            entry_price DECIMAL(20,8) NOT NULL DEFAULT 0,
            current_price DECIMAL(20,8) NOT NULL DEFAULT 0,
            sl DECIMAL(20,8) NOT NULL DEFAULT 0,
            tp DECIMAL(20,8) NOT NULL DEFAULT 0,
            volume DECIMAL(20,8) NOT NULL DEFAULT 0,
            profit DECIMAL(20,8) NOT NULL DEFAULT 0,
            swap DECIMAL(20,8) NOT NULL DEFAULT 0,
            commission DECIMAL(20,8) NOT NULL DEFAULT 0,
            magic BIGINT NOT NULL DEFAULT 0,
            comment TEXT NULL,
            opened_at DATETIME NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'open',
            ea_version VARCHAR(64) NOT NULL DEFAULT '',
            last_seen_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            raw_json LONGTEXT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY deterministic_key (deterministic_key),
            KEY user_state (user_id, state),
            KEY user_account_terminal (user_id, account_id, terminal_id)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_trade_orders (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            deterministic_key VARCHAR(191) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            account_id VARCHAR(64) NOT NULL DEFAULT '',
            terminal_id VARCHAR(96) NOT NULL DEFAULT '',
            order_id VARCHAR(64) NOT NULL DEFAULT '',
            symbol VARCHAR(96) NOT NULL DEFAULT '',
            normalized_symbol VARCHAR(64) NOT NULL DEFAULT '',
            order_type VARCHAR(32) NOT NULL DEFAULT '',
            direction VARCHAR(32) NOT NULL DEFAULT '',
            entry_price DECIMAL(20,8) NOT NULL DEFAULT 0,
            sl DECIMAL(20,8) NOT NULL DEFAULT 0,
            tp DECIMAL(20,8) NOT NULL DEFAULT 0,
            volume DECIMAL(20,8) NOT NULL DEFAULT 0,
            magic BIGINT NOT NULL DEFAULT 0,
            comment TEXT NULL,
            placed_at DATETIME NULL,
            state VARCHAR(32) NOT NULL DEFAULT 'active',
            ea_version VARCHAR(64) NOT NULL DEFAULT '',
            last_seen_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            raw_json LONGTEXT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY deterministic_key (deterministic_key),
            KEY user_state (user_id, state),
            KEY user_account_terminal (user_id, account_id, terminal_id)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_account_telemetry (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            account_id VARCHAR(64) NOT NULL DEFAULT '',
            terminal_id VARCHAR(96) NOT NULL DEFAULT '',
            balance DECIMAL(20,8) NOT NULL DEFAULT 0,
            equity DECIMAL(20,8) NOT NULL DEFAULT 0,
            margin DECIMAL(20,8) NOT NULL DEFAULT 0,
            free_margin DECIMAL(20,8) NOT NULL DEFAULT 0,
            margin_level DECIMAL(20,8) NOT NULL DEFAULT 0,
            floating_pl DECIMAL(20,8) NOT NULL DEFAULT 0,
            currency VARCHAR(32) NOT NULL DEFAULT '',
            leverage BIGINT NOT NULL DEFAULT 0,
            ea_version VARCHAR(64) NOT NULL DEFAULT '',
            last_seen_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            raw_json LONGTEXT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY user_account_terminal (user_id, account_id, terminal_id),
            KEY user_last_seen (user_id, last_seen_at)
        ) $charset;";

        foreach ($tables as $sql) {
            dbDelta($sql);
            if (is_object($wpdb) && property_exists($wpdb, 'last_error') && $wpdb->last_error !== '') {
                return false;
            }
        }

        return true;
    }

    public static function get_regime_snapshots_table_sql(string $charset): string {
        global $wpdb;

        return "CREATE TABLE {$wpdb->prefix}smc_sf_regime_snapshots (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            symbol VARCHAR(24) NOT NULL,
            htf_bias VARCHAR(16) NOT NULL DEFAULT 'TRANSITIONAL',
            ltf_regime VARCHAR(16) NOT NULL DEFAULT 'RANGING',
            chop_score DECIMAL(5,4) NOT NULL DEFAULT 0.5000,
            ema20_d1 DECIMAL(20,8) DEFAULT NULL,
            atr14_h1 DECIMAL(20,8) DEFAULT NULL,
            htf_bias_high DECIMAL(20,8) DEFAULT NULL,
            htf_bias_low DECIMAL(20,8) DEFAULT NULL,
            source VARCHAR(20) NOT NULL DEFAULT 'mt5',
            calculated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY regime_lookup (user_id, symbol),
            KEY user_updated (user_id, calculated_at)
        ) $charset;";
    }

    public static function ensure_regime_snapshots_table() {
        global $wpdb;

        if (file_exists(ABSPATH . 'wp-admin/includes/upgrade.php')) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        if (!function_exists('dbDelta')) {
            return false;
        }

        if (is_object($wpdb) && property_exists($wpdb, 'last_error')) {
            $wpdb->last_error = '';
        }

        dbDelta(self::get_regime_snapshots_table_sql($wpdb->get_charset_collate()));

        if (is_object($wpdb) && property_exists($wpdb, 'last_error') && $wpdb->last_error !== '') {
            return false;
        }

        return true;
    }

    public static function ensure_soak_tables() {
        global $wpdb;

        if (file_exists(ABSPATH . 'wp-admin/includes/upgrade.php')) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        if (!function_exists('dbDelta')) {
            return false;
        }

        if (is_object($wpdb) && property_exists($wpdb, 'last_error')) {
            $wpdb->last_error = '';
        }

        $charset = $wpdb->get_charset_collate();
        $tables = array();

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_soak_evidence (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            evidence_key VARCHAR(128) NOT NULL,
            evidence_type VARCHAR(64) NOT NULL,
            evidence_value TEXT NOT NULL,
            operator VARCHAR(128) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            UNIQUE KEY evidence_key (evidence_key)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_soak_checkpoints (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            checkpoint_type VARCHAR(32) NOT NULL DEFAULT 'checkpoint',
            snapshot_data LONGTEXT NOT NULL,
            operator_notes TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            KEY checkpoint_type_created_at (checkpoint_type, created_at)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_fib_levels (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            symbol VARCHAR(24) NOT NULL,
            timeframe VARCHAR(16) NOT NULL,
            family VARCHAR(16) NOT NULL,
            ratio DECIMAL(10,4) NOT NULL,
            price DECIMAL(20,8) NOT NULL,
            source VARCHAR(20) NOT NULL DEFAULT 'mt5',
            calculated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY fib_lookup (user_id, symbol, timeframe, family, ratio),
            KEY symbol_time (user_id, symbol, calculated_at)
        ) $charset;";

        $tables[] = self::get_regime_snapshots_table_sql($charset);

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_fundamental_events (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            currency VARCHAR(8) NOT NULL,
            event_type VARCHAR(32) NOT NULL,
            event_name VARCHAR(128) NOT NULL,
            event_date DATE NOT NULL,
            actual DECIMAL(10,4) DEFAULT NULL,
            forecast DECIMAL(10,4) DEFAULT NULL,
            previous DECIMAL(10,4) DEFAULT NULL,
            raw_score DECIMAL(5,2) NOT NULL DEFAULT 0,
            source VARCHAR(32) NOT NULL DEFAULT 'twelve_data',
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY event_lookup (currency, event_date, event_name(64)),
            KEY currency_date (currency, event_date)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_fundamental_bias (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            currency VARCHAR(8) NOT NULL,
            composite_score DECIMAL(5,2) NOT NULL DEFAULT 0,
            category VARCHAR(16) NOT NULL DEFAULT 'NEUTRAL',
            event_count INT UNSIGNED NOT NULL DEFAULT 0,
            computed_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY currency_lookup (currency),
            KEY expires (expires_at)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_mt5_signal_candidates (
            id VARCHAR(64) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            symbol VARCHAR(24) NOT NULL,
            direction VARCHAR(8) NOT NULL,
            status VARCHAR(8) NOT NULL DEFAULT 'WATCH',
            verdict VARCHAR(4) NOT NULL DEFAULT 'C',
            entry_price DECIMAL(20,8) NOT NULL,
            sl_price DECIMAL(20,8) DEFAULT NULL,
            tp_price DECIMAL(20,8) DEFAULT NULL,
            fib_level DECIMAL(20,8) DEFAULT NULL,
            fib_ratio DECIMAL(10,4) DEFAULT NULL,
            fib_family VARCHAR(16) DEFAULT NULL,
            htf_bias VARCHAR(16) DEFAULT NULL,
            ltf_regime VARCHAR(16) DEFAULT NULL,
            confidence DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
            pine_match VARCHAR(16) DEFAULT NULL,
            drift_pips DECIMAL(10,4) DEFAULT NULL,
            source VARCHAR(8) NOT NULL DEFAULT 'mt5',
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_symbol (user_id, symbol),
            KEY user_created (user_id, created_at)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_execution_audit (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            signal_id VARCHAR(64) DEFAULT NULL,
            symbol VARCHAR(24) NOT NULL,
            direction VARCHAR(8) NOT NULL,
            order_type VARCHAR(16) NOT NULL DEFAULT 'MARKET',
            lots DECIMAL(10,4) NOT NULL,
            entry_price DECIMAL(20,8) DEFAULT NULL,
            sl_price DECIMAL(20,8) DEFAULT NULL,
            tp_price DECIMAL(20,8) DEFAULT NULL,
            mt5_ticket BIGINT DEFAULT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
            reject_reason VARCHAR(256) DEFAULT NULL,
            risk_check_passed TINYINT(1) NOT NULL DEFAULT 0,
            requested_at DATETIME NOT NULL,
            executed_at DATETIME DEFAULT NULL,
            ack_at DATETIME DEFAULT NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_signal (user_id, signal_id(48)),
            KEY user_status (user_id, status)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_approval_queue (
            id VARCHAR(64) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            signal_id VARCHAR(64) DEFAULT NULL,
            signal_data LONGTEXT NOT NULL,
            regime_data LONGTEXT DEFAULT NULL,
            fundamental_data LONGTEXT DEFAULT NULL,
            risk_data LONGTEXT DEFAULT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
            operator_note VARCHAR(512) DEFAULT NULL,
            created_at DATETIME NOT NULL,
            reviewed_at DATETIME DEFAULT NULL,
            expires_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_status (user_id, status),
            KEY expires (expires_at)
        ) $charset;";

        $tables[] = "CREATE TABLE {$wpdb->prefix}smc_sf_license_tiers (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            tier VARCHAR(20) NOT NULL DEFAULT 'Basic',
            max_symbols INT UNSIGNED NOT NULL DEFAULT 5,
            max_ea_sessions TINYINT UNSIGNED NOT NULL DEFAULT 1,
            execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
            api_access_enabled TINYINT(1) NOT NULL DEFAULT 0,
            expires_at DATETIME DEFAULT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY user_license (user_id)
        ) $charset;";

        $fundamentals_table = $wpdb->prefix . 'smc_sf_fundamental_events';
        $event_lookup_index = $wpdb->get_results("SHOW INDEX FROM {$fundamentals_table} WHERE Key_name = 'event_lookup'");
        if (is_array($event_lookup_index) && !empty($event_lookup_index)) {
            $event_lookup_columns = array();
            foreach ($event_lookup_index as $index_part) {
                if (is_object($index_part) && isset($index_part->Seq_in_index, $index_part->Column_name)) {
                    $event_lookup_columns[(int) $index_part->Seq_in_index] = $index_part->Column_name;
                }
            }
            ksort($event_lookup_columns);
            $event_lookup_columns = array_values($event_lookup_columns);
            $expected_event_lookup = array('currency', 'event_date', 'event_name');
            if ($event_lookup_columns !== $expected_event_lookup) {
                $wpdb->query("ALTER TABLE {$fundamentals_table} DROP KEY event_lookup");
                $wpdb->query("ALTER TABLE {$fundamentals_table} ADD UNIQUE KEY event_lookup (currency, event_date, event_name(64))");
                if (is_object($wpdb) && property_exists($wpdb, 'last_error') && $wpdb->last_error !== '') {
                    return false;
                }
            }
        }

        foreach ($tables as $sql) {
            dbDelta($sql);
            if (is_object($wpdb) && property_exists($wpdb, 'last_error') && $wpdb->last_error !== '') {
                return false;
            }
        }

        $events_table = $wpdb->prefix . 'smc_sf_fundamental_events';
        $old_key_exists = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = %s
               AND INDEX_NAME   = 'event_lookup'
               AND COLUMN_NAME  = 'event_type'",
            $events_table
        ));
        if ((int) $old_key_exists > 0) {
            $wpdb->query("ALTER TABLE `{$events_table}`
                DROP INDEX `event_lookup`,
                ADD UNIQUE KEY `event_lookup` (`currency`, `event_date`, `event_name`(64))");
            error_log('[SMC_SF] fundamental_events: migrated event_lookup key to (currency, event_date, event_name(64))');
        }

        return true;
    }
}
