<?php
namespace SMC\SuperFib\Rest;

use WP_REST_Server;

class Routes {
    public static function register_routes($instance): void {
        $namespace = \SMC_SuperFib_Sniper_REST::NAMESPACE;

        register_rest_route($namespace, '/admin/health', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_admin_health'),
            'permission_callback' => array($instance, 'permission_admin'),
        ));

        register_rest_route($namespace, '/admin/soak-report', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_soak_report'),
            'permission_callback' => array($instance, 'permission_admin'),
        ));

        register_rest_route($namespace, '/admin/soak-evidence', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'upsert_soak_evidence'),
            'permission_callback' => array($instance, 'permission_admin'),
        ));

        register_rest_route($namespace, '/admin/soak-checkpoint', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'create_soak_checkpoint'),
            'permission_callback' => array($instance, 'permission_admin'),
        ));

        register_rest_route($namespace, '/admin/soak-reset', array(
            'methods' => WP_REST_Server::DELETABLE,
            'callback' => array($instance, 'reset_soak'),
            'permission_callback' => array($instance, 'permission_admin'),
        ));

        register_rest_route($namespace, '/health', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_health'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route($namespace, '/session', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_session'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route($namespace, '/snapshot', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_snapshot'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/snapshot', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_snapshot'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/charts', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_chart_snapshot'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/regimes', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_regimes'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/regime', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_regime'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/live-signals', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_live_signals'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/signal', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_signal'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/ladders', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_ladders'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/engine-batch', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_engine_batch'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/market-data', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_user_market_data'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/trades', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_user_trades'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/trades', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_user_trades'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/account', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_user_account'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/account', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_user_account'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/progress', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_user_progress'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/settings', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_user_settings'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/settings', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_user_settings'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/risk-profile', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_user_risk_profile'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/risk-profile', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_user_risk_profile'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/trade-queue', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_user_trade_queue'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/trade-queue', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_user_trade_queue'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/execute-signals', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_execute_signals'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/twelve-data-key', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_twelve_data_key'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/twelve-data-key', array(
            'methods' => WP_REST_Server::DELETABLE,
            'callback' => array($instance, 'delete_twelve_data_key'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/watchlist', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_user_watchlist'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/watchlist', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_user_watchlist'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/watchlist/add', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_watchlist_add'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/watchlist/remove', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_watchlist_remove'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/instruments', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_instruments'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/account-telemetry', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_account_telemetry'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/positions', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_positions'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/orders', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_orders'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/market-data-authority', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_market_data_authority'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/authority-diagnostics', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_authority_diagnostics'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/ea/market-stream', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_ea_market_stream'),
            'permission_callback' => array($instance, 'permission_ea_market_stream'),
        ));

        register_rest_route($namespace, '/ea/heartbeat', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_ea_heartbeat'),
            'permission_callback' => array($instance, 'permission_ea_bridge'),
        ));

        register_rest_route($namespace, '/ea/account-sync', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_ea_account_sync'),
            'permission_callback' => array($instance, 'permission_ea_bridge'),
        ));

        register_rest_route($namespace, '/ea/symbol-sync', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_ea_symbol_sync'),
            'permission_callback' => array($instance, 'permission_ea_bridge'),
        ));

        register_rest_route($namespace, '/ea/license-check', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_ea_license_check'),
            'permission_callback' => array($instance, 'permission_ea_bridge'),
        ));

        register_rest_route($namespace, '/ea/fib-levels', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_ea_fib_levels'),
            'permission_callback' => array($instance, 'permission_ea_bridge'),
        ));

        register_rest_route($namespace, '/market-data/fib-levels', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_market_data_fib_levels'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/ea/regime-snapshot', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_ea_regime_snapshot'),
            'permission_callback' => array($instance, 'permission_ea_bridge'),
        ));

        register_rest_route($namespace, '/market-data/regime', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_market_data_regime'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/fundamentals/refresh', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_fundamentals_refresh'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/fundamentals/bias', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_fundamentals_bias'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/ea/signal-candidates', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_ea_signal_candidates'),
            'permission_callback' => array($instance, 'permission_ea_bridge'),
        ));

        register_rest_route($namespace, '/market-data/signal-drift', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_market_data_signal_drift'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/ea/execution-queue', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_ea_execution_queue'),
            'permission_callback' => array($instance, 'permission_ea_bridge'),
        ));

        register_rest_route($namespace, '/ea/execution-ack', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_ea_execution_ack'),
            'permission_callback' => array($instance, 'permission_ea_bridge'),
        ));

        register_rest_route($namespace, '/user/execution-request', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_user_execution_request'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/execution-audit', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_user_execution_audit'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/approval-queue', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_user_approval_queue'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/approval-queue/review', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_approval_queue_review'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/user/license', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($instance, 'get_user_license'),
            'permission_callback' => array($instance, 'permission_user'),
        ));

        register_rest_route($namespace, '/admin/license/set-tier', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($instance, 'post_admin_set_license_tier'),
            'permission_callback' => array($instance, 'permission_admin'),
        ));
    }
}
