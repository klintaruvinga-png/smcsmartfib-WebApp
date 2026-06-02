<?php
/**
 * REST route registrar for the SMC SuperFIB plugin.
 *
 * Keeps endpoint wiring outside the main REST class while preserving the exact
 * callbacks, permission callbacks, and route methods registered by the monolith.
 */

if (!defined('ABSPATH')) {
    exit;
}

final class SMC_SuperFib_Route_Registrar {
    public function register($plugin) {
        $this->route($plugin, '/health', WP_REST_Server::READABLE, 'get_health', false);
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/admin/health', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($plugin, 'get_admin_health'),
            'permission_callback' => array($plugin, 'permission_admin'),
        ));
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/admin/soak-report', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($plugin, 'get_soak_report'),
            'permission_callback' => array($plugin, 'permission_admin'),
        ));
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/admin/soak-evidence', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'upsert_soak_evidence'),
            'permission_callback' => array($plugin, 'permission_admin'),
        ));
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/admin/soak-checkpoint', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'create_soak_checkpoint'),
            'permission_callback' => array($plugin, 'permission_admin'),
        ));
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/admin/soak-reset', array(
            'methods' => WP_REST_Server::DELETABLE,
            'callback' => array($plugin, 'reset_soak'),
            'permission_callback' => array($plugin, 'permission_admin'),
        ));
        $this->route($plugin, '/session', WP_REST_Server::READABLE, 'get_session', false);
        $this->route($plugin, '/snapshot', WP_REST_Server::READABLE, 'get_snapshot', true);
        $this->route($plugin, '/snapshot', WP_REST_Server::CREATABLE, 'post_snapshot', true);
        $this->route($plugin, '/charts', WP_REST_Server::READABLE, 'get_chart_snapshot', true);
        $this->route($plugin, '/regimes', WP_REST_Server::READABLE, 'get_regimes', true);
        $this->route($plugin, '/regime', WP_REST_Server::CREATABLE, 'post_regime', true);
        $this->route($plugin, '/live-signals', WP_REST_Server::READABLE, 'get_live_signals', true);
        $this->route($plugin, '/signal', WP_REST_Server::CREATABLE, 'post_signal', true);
        $this->route($plugin, '/ladders', WP_REST_Server::READABLE, 'get_ladders', true);

        $this->route($plugin, '/user/engine-batch', WP_REST_Server::CREATABLE, 'post_engine_batch', true);
        $this->route($plugin, '/user/market-data', WP_REST_Server::CREATABLE, 'post_user_market_data', true);
        $this->route($plugin, '/user/trades', WP_REST_Server::READABLE, 'get_user_trades', true);
        $this->route($plugin, '/user/trades', WP_REST_Server::CREATABLE, 'post_user_trades', true);
        $this->route($plugin, '/user/account', WP_REST_Server::READABLE, 'get_user_account', true);
        $this->route($plugin, '/user/account', WP_REST_Server::CREATABLE, 'post_user_account', true);
        $this->route($plugin, '/user/progress', WP_REST_Server::READABLE, 'get_user_progress', true);
        $this->route($plugin, '/user/settings', WP_REST_Server::READABLE, 'get_user_settings', true);
        $this->route($plugin, '/user/settings', WP_REST_Server::CREATABLE, 'post_user_settings', true);
        $this->route($plugin, '/user/risk-profile', WP_REST_Server::READABLE, 'get_user_risk_profile', true);
        $this->route($plugin, '/user/risk-profile', WP_REST_Server::CREATABLE, 'post_user_risk_profile', true);
        $this->route($plugin, '/user/trade-queue', WP_REST_Server::READABLE, 'get_user_trade_queue', true);
        $this->route($plugin, '/user/trade-queue', WP_REST_Server::CREATABLE, 'post_user_trade_queue', true);
        $this->route($plugin, '/user/execute-signals', WP_REST_Server::CREATABLE, 'post_execute_signals', true);
        $this->route($plugin, '/user/twelve-data-key', WP_REST_Server::CREATABLE, 'post_twelve_data_key', true);
        $this->route($plugin, '/user/twelve-data-key', WP_REST_Server::DELETABLE, 'delete_twelve_data_key', true);
        $this->route($plugin, '/user/watchlist', WP_REST_Server::READABLE, 'get_user_watchlist', true);
        $this->route($plugin, '/user/watchlist', WP_REST_Server::CREATABLE, 'post_user_watchlist', true);
        $this->route($plugin, '/user/watchlist/add', WP_REST_Server::CREATABLE, 'post_watchlist_add', true);
        $this->route($plugin, '/user/watchlist/remove', WP_REST_Server::CREATABLE, 'post_watchlist_remove', true);
        $this->route($plugin, '/instruments', WP_REST_Server::READABLE, 'get_instruments', true);
        $this->route($plugin, '/account-telemetry', WP_REST_Server::READABLE, 'get_account_telemetry', true);
        $this->route($plugin, '/positions', WP_REST_Server::READABLE, 'get_positions', true);
        $this->route($plugin, '/orders', WP_REST_Server::READABLE, 'get_orders', true);
        $this->route($plugin, '/market-data-authority', WP_REST_Server::READABLE, 'get_market_data_authority', true);
        $this->route($plugin, '/authority-diagnostics', WP_REST_Server::READABLE, 'get_authority_diagnostics', true);

        // MT5 EA market data ingestion endpoint (API key auth, no session/cookies).
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/ea/market-stream', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_ea_market_stream'),
            'permission_callback' => array($plugin, 'permission_ea_market_stream'),
        ));
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/ea/heartbeat', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_ea_heartbeat'),
            'permission_callback' => array($plugin, 'permission_ea_bridge'),
        ));
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/ea/account-sync', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_ea_account_sync'),
            'permission_callback' => array($plugin, 'permission_ea_bridge'),
        ));
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/ea/symbol-sync', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_ea_symbol_sync'),
            'permission_callback' => array($plugin, 'permission_ea_bridge'),
        ));
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/ea/license-check', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($plugin, 'get_ea_license_check'),
            'permission_callback' => array($plugin, 'permission_ea_bridge'),
        ));

        // Phase 4: fib level ingestion from MT5 EA
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/ea/fib-levels', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_ea_fib_levels'),
            'permission_callback' => array($plugin, 'permission_ea_bridge'),
        ));

        // Phase 4: fib level retrieval for dashboard
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/market-data/fib-levels', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($plugin, 'get_market_data_fib_levels'),
            'permission_callback' => array($plugin, 'permission_user'),
        ));

        // Phase 5: regime snapshot ingestion from MT5 EA
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/ea/regime-snapshot', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_ea_regime_snapshot'),
            'permission_callback' => array($plugin, 'permission_ea_bridge'),
        ));

        // Phase 5: regime data retrieval for dashboard
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/market-data/regime', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($plugin, 'get_market_data_regime'),
            'permission_callback' => array($plugin, 'permission_user'),
        ));

        // Phase 5B: fundamentals bias refresh (admin or user-triggered)
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/fundamentals/refresh', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_fundamentals_refresh'),
            'permission_callback' => array($plugin, 'permission_user'),
        ));

        // Phase 5B: fundamentals bias retrieval for dashboard
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/fundamentals/bias', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($plugin, 'get_fundamentals_bias'),
            'permission_callback' => array($plugin, 'permission_user'),
        ));

        // Phase 6: MT5 signal candidates ingestion (dual-run)
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/ea/signal-candidates', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_ea_signal_candidates'),
            'permission_callback' => array($plugin, 'permission_ea_bridge'),
        ));

        // Phase 6: Signal drift report for dashboard
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/market-data/signal-drift', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($plugin, 'get_market_data_signal_drift'),
            'permission_callback' => array($plugin, 'permission_user'),
        ));

        // Phase 7: Execution queue polling by MT5 EA
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/ea/execution-queue', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($plugin, 'get_ea_execution_queue'),
            'permission_callback' => array($plugin, 'permission_ea_bridge'),
        ));

        // Phase 7: Execution acknowledgement from MT5 EA
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/ea/execution-ack', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_ea_execution_ack'),
            'permission_callback' => array($plugin, 'permission_ea_bridge'),
        ));

        // Phase 7: Operator execution request from dashboard
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/user/execution-request', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_user_execution_request'),
            'permission_callback' => array($plugin, 'permission_user'),
        ));

        // Phase 7: Execution audit trail for dashboard
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/user/execution-audit', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($plugin, 'get_user_execution_audit'),
            'permission_callback' => array($plugin, 'permission_user'),
        ));

        // Phase 8: Approval queue read/review
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/user/approval-queue', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($plugin, 'get_user_approval_queue'),
            'permission_callback' => array($plugin, 'permission_user'),
        ));
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/user/approval-queue/review', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_approval_queue_review'),
            'permission_callback' => array($plugin, 'permission_user'),
        ));

        // Phase 9: License tier read (user) and management (admin)
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/user/license', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($plugin, 'get_user_license'),
            'permission_callback' => array($plugin, 'permission_user'),
        ));
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, '/admin/license/set-tier', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($plugin, 'post_admin_set_license_tier'),
            'permission_callback' => array($plugin, 'permission_admin'),
        ));
    }

    private function route($plugin, $path, $method, $callback, $auth = true) {
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, $path, array(
            'methods' => $method,
            'callback' => array($plugin, $callback),
            'permission_callback' => $auth ? array($plugin, 'permission_user') : '__return_true',
        ));
    }
}
