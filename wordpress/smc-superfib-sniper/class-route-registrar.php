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
    /**
     * Register every REST endpoint exposed by the plugin.
     *
     * @param object $plugin Callback host, normally SMC_SuperFib_Sniper_REST.
     */
    public function register($plugin) {
        foreach ($this->route_definitions() as $definition) {
            $this->register_route($plugin, $definition);
        }
    }

    /**
     * Declarative REST contract migrated out of SMC_SuperFib_Sniper_REST.
     *
     * Each definition maps directly to one register_rest_route() call.
     */
    private function route_definitions() {
        return array(
            array('path' => '/health', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_health', 'permission' => 'public'),
            array('path' => '/admin/health', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_admin_health', 'permission' => 'admin'),
            array('path' => '/admin/soak-report', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_soak_report', 'permission' => 'admin'),
            array('path' => '/admin/soak-evidence', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'upsert_soak_evidence', 'permission' => 'admin'),
            array('path' => '/admin/soak-checkpoint', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'create_soak_checkpoint', 'permission' => 'admin'),
            array('path' => '/admin/soak-reset', 'methods' => WP_REST_Server::DELETABLE, 'callback' => 'reset_soak', 'permission' => 'admin'),
            array('path' => '/session', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_session', 'permission' => 'public'),
            array('path' => '/snapshot', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_snapshot'),
            array('path' => '/snapshot', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_snapshot'),
            array('path' => '/snapshot/unified', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_unified_snapshot'),
            array('path' => '/charts', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_chart_snapshot'),
            array('path' => '/regimes', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_regimes'),
            array('path' => '/regime', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_regime'),
            array('path' => '/live-signals', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_live_signals'),
            array('path' => '/signal', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_signal'),
            array('path' => '/ladders', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_ladders'),
            array('path' => '/user/engine-batch', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_engine_batch'),
            array('path' => '/user/market-data', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_user_market_data'),
            array('path' => '/user/trades', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_user_trades'),
            array('path' => '/user/trades', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_user_trades'),
            array('path' => '/user/account', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_user_account'),
            array('path' => '/user/account', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_user_account'),
            array('path' => '/user/progress', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_user_progress'),
            array('path' => '/user/settings', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_user_settings'),
            array('path' => '/user/settings', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_user_settings'),
            array('path' => '/user/risk-profile', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_user_risk_profile'),
            array('path' => '/user/risk-profile', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_user_risk_profile'),
            array('path' => '/user/trade-queue', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_user_trade_queue'),
            array('path' => '/user/trade-queue', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_user_trade_queue'),
            array('path' => '/user/execute-signals', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_execute_signals'),
            array('path' => '/user/twelve-data-key', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_twelve_data_key'),
            array('path' => '/user/twelve-data-key', 'methods' => WP_REST_Server::DELETABLE, 'callback' => 'delete_twelve_data_key'),
            array('path' => '/user/watchlist', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_user_watchlist'),
            array('path' => '/user/watchlist', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_user_watchlist'),
            array('path' => '/user/watchlist/add', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_watchlist_add'),
            array('path' => '/user/watchlist/remove', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_watchlist_remove'),
            array('path' => '/instruments', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_instruments'),
            array('path' => '/account-telemetry', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_account_telemetry'),
            array('path' => '/positions', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_positions'),
            array('path' => '/orders', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_orders'),
            array('path' => '/market-data-authority', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_market_data_authority'),
            array('path' => '/authority-diagnostics', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_authority_diagnostics'),
            array('path' => '/ea/market-stream', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_ea_market_stream', 'permission' => 'ea_market_stream'),
            array('path' => '/ea/heartbeat', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_ea_heartbeat', 'permission' => 'ea_bridge'),
            array('path' => '/ea/account-sync', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_ea_account_sync', 'permission' => 'ea_bridge'),
            array('path' => '/ea/symbol-sync', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_ea_symbol_sync', 'permission' => 'ea_bridge'),
            array('path' => '/ea/license-check', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_ea_license_check', 'permission' => 'ea_bridge'),
            array('path' => '/ea/fib-levels', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_ea_fib_levels', 'permission' => 'ea_bridge'),
            array('path' => '/market-data/fib-levels', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_market_data_fib_levels'),
            array('path' => '/market-data/candles', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_market_data_candles'),
            array('path' => '/ea/regime-snapshot', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_ea_regime_snapshot', 'permission' => 'ea_bridge'),
            array('path' => '/market-data/regime', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_market_data_regime'),
            array('path' => '/fundamentals/refresh', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_fundamentals_refresh'),
            array('path' => '/fundamentals/bias', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_fundamentals_bias'),
            array('path' => '/ea/signal-candidates', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_ea_signal_candidates', 'permission' => 'ea_bridge'),
            array('path' => '/market-data/signal-drift', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_market_data_signal_drift'),
            array('path' => '/ea/execution-queue', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_ea_execution_queue', 'permission' => 'ea_bridge'),
            array('path' => '/ea/execution-ack', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_ea_execution_ack', 'permission' => 'ea_bridge'),
            array('path' => '/user/execution-request', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_user_execution_request'),
            array('path' => '/user/execution-audit', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_user_execution_audit'),
            array('path' => '/user/approval-queue', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_user_approval_queue'),
            array('path' => '/user/approval-queue/review', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_approval_queue_review'),
            array('path' => '/user/license', 'methods' => WP_REST_Server::READABLE, 'callback' => 'get_user_license'),
            array('path' => '/admin/license/set-tier', 'methods' => WP_REST_Server::CREATABLE, 'callback' => 'post_admin_set_license_tier', 'permission' => 'admin'),
        );
    }

    private function register_route($plugin, $definition) {
        register_rest_route(SMC_SuperFib_Sniper_REST::NAMESPACE, $definition['path'], array(
            'methods' => $definition['methods'],
            'callback' => array($plugin, $definition['callback']),
            'permission_callback' => $this->permission_callback($plugin, isset($definition['permission']) ? $definition['permission'] : 'user'),
        ));
    }

    private function permission_callback($plugin, $permission) {
        if ($permission === 'public') {
            return '__return_true';
        }

        $callbacks = array(
            'admin' => 'permission_admin',
            'ea_bridge' => 'permission_ea_bridge',
            'ea_market_stream' => 'permission_ea_market_stream',
            'user' => 'permission_user',
        );

        $method = isset($callbacks[$permission]) ? $callbacks[$permission] : $callbacks['user'];
        return array($plugin, $method);
    }
}
