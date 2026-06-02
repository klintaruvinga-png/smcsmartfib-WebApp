<?php
namespace SMC\SuperFib\Service;

use WP_REST_Request;

final class UserService {
    private $legacy;

    public function __construct($legacy) {
        $this->legacy = $legacy;
    }

    public function post_user_market_data(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $symbols = isset($payload['symbols']) ? $this->legacy->sanitize_symbols($payload['symbols']) : $this->legacy->get_settings($user_id)['watchlist'];
        return rest_ensure_response($this->legacy->refresh_prices($user_id, $symbols));
    }

    public function get_user_trades() {
        $user_id = get_current_user_id();
        return $this->legacy->no_cache_response(array(
            'positions' => $this->legacy->read_trade_payloads($user_id, 'position'),
            'orders' => $this->legacy->read_pending_orders($user_id),
        ));
    }

    public function get_account_telemetry() {
        return $this->legacy->no_cache_response($this->legacy->read_account_telemetry(get_current_user_id()));
    }

    public function get_positions() {
        return $this->legacy->no_cache_response($this->legacy->read_trade_positions(get_current_user_id()));
    }

    public function get_orders() {
        return $this->legacy->no_cache_response($this->legacy->read_trade_orders(get_current_user_id()));
    }

    public function post_user_trades(WP_REST_Request $request) {
        $this->legacy->audit(get_current_user_id(), 'trades.posted', (array) $request->get_json_params());
        return rest_ensure_response(array('ok' => true));
    }

    public function get_user_account() {
        return $this->legacy->no_cache_response($this->legacy->get_account_state(get_current_user_id()));
    }

    public function get_user_progress() {
        return $this->legacy->no_cache_response($this->legacy->read_user_progress(get_current_user_id()));
    }

    public function post_user_account(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $writable = array('balanceUSC', 'equityUSC', 'marginUsedPct', 'drawdownPct', 'todayPnlUSC', 'todayPnlPct');
        $update = array();
        foreach ($writable as $key) {
            if (array_key_exists($key, $payload)) {
                $update[$key] = (float) $payload[$key];
            }
        }

        $existing = $this->legacy->get_account_blob($user_id);
        $existing['account'] = array_merge(
            isset($existing['account']) && is_array($existing['account']) ? $existing['account'] : array(),
            $update,
            array('updatedAt' => gmdate('c'))
        );
        $this->legacy->replace_json('account_snapshots', array(
            'user_id' => $user_id,
            'data' => $existing,
            'updated_at' => $this->legacy->now_mysql(),
        ));
        $this->legacy->audit($user_id, 'account.updated', $update);
        return rest_ensure_response(array('ok' => true));
    }

    public function get_user_trade_queue() {
        return rest_ensure_response($this->legacy->read_pending_orders(get_current_user_id()));
    }

    public function post_user_trade_queue(WP_REST_Request $request) {
        $this->legacy->audit(get_current_user_id(), 'trade_queue.posted', (array) $request->get_json_params());
        return rest_ensure_response(array('ok' => true));
    }
}
