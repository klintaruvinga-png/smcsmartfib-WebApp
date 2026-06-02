<?php
namespace SMC\SuperFib\Service;

use WP_REST_Request;

final class SettingsService {
    private $legacy;

    public function __construct($legacy) {
        $this->legacy = $legacy;
    }

    public function get_user_settings() {
        $user_id = get_current_user_id();
        $settings = $this->legacy->get_settings($user_id);
        return rest_ensure_response($settings);
    }

    public function post_user_settings(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $current = $this->legacy->get_settings($user_id);
        $settings = array_merge($current, array(
            'backendUrl' => isset($payload['backendUrl']) ? esc_url_raw($payload['backendUrl']) : $current['backendUrl'],
            'refreshIntervalSec' => $this->legacy->int_between($payload, 'refreshIntervalSec', 2, 60, $current['refreshIntervalSec']),
            'staleThresholdSec' => $this->legacy->int_between($payload, 'staleThresholdSec', 10, 120, $current['staleThresholdSec']),
            'watchlist' => $this->legacy->validate_watchlist_symbols(isset($payload['watchlist']) ? $payload['watchlist'] : $current['watchlist']),
            'riskAllocation' => $this->legacy->sanitize_risk_allocation(isset($payload['riskAllocation']) ? $payload['riskAllocation'] : $current['riskAllocation'], $current['riskAllocation']),
            'signalBoardSize' => $this->legacy->sanitize_signal_board_size($payload['signalBoardSize'] ?? ($payload['boardSize'] ?? $current['signalBoardSize'])),
        ));

        $this->legacy->replace_json('user_settings', array(
            'user_id' => $user_id,
            'settings' => $settings,
            'updated_at' => $this->legacy->now_mysql(),
        ));
        $this->legacy->invalidate_watchlist_snapshot_if_changed($user_id, $current['watchlist'], $settings['watchlist'], 'post_user_settings');

        if (isset($settings['riskAllocation']) && is_array($settings['riskAllocation'])) {
            $ra = $settings['riskAllocation'];
            $existing_blob = $this->legacy->get_account_blob($user_id);
            $existing_blob['riskProfile'] = array_merge(
                $this->legacy->get_risk_profile($user_id),
                array(
                    'perTradePct' => (float) ($ra['perTradePct'] ?? 0.5),
                    'dailyMaxPct' => (float) ($ra['dailyMaxPct'] ?? 2.0),
                    'ddCapPct' => (float) ($ra['ddCapPct'] ?? 6.0),
                    'updatedAt' => gmdate('c'),
                )
            );
            $this->legacy->replace_json('account_snapshots', array(
                'user_id' => $user_id,
                'data' => $existing_blob,
                'updated_at' => $this->legacy->now_mysql(),
            ));
        }

        $persisted_settings = $this->legacy->get_settings($user_id);
        $this->legacy->audit($user_id, 'settings.updated', array('watchlist' => $persisted_settings['watchlist']));

        return rest_ensure_response(array('ok' => true, 'watchlist' => $persisted_settings['watchlist']));
    }

    public function post_twelve_data_key(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $api_key = isset($payload['apiKey']) ? trim((string) $payload['apiKey']) : '';
        $test_only = !empty($payload['testOnly']);

        if ($api_key === '') {
            return rest_ensure_response(array('ok' => false, 'status' => 'missing', 'message' => 'Twelve Data API key is required.'));
        }

        if (strlen($api_key) < 8 || strlen($api_key) > 64 || !preg_match('/^[A-Za-z0-9_\-]+$/', $api_key)) {
            return rest_ensure_response(array('ok' => false, 'status' => 'invalid', 'message' => 'Invalid API key format.'));
        }

        $validation = $this->legacy->validate_twelve_key($api_key);
        if (!$validation['ok']) {
            return rest_ensure_response($validation);
        }

        if (!$test_only) {
            $encrypted = $this->legacy->encrypt_secret($api_key);
            if (is_wp_error($encrypted)) {
                return $encrypted;
            }

            $provider = get_class($this->legacy)::TWELVE_PROVIDER;
            $wpdb->replace(
                $this->legacy->table('integrations'),
                array(
                    'user_id' => $user_id,
                    'provider' => $provider,
                    'encrypted_secret' => $encrypted,
                    'key_status' => 'ok',
                    'updated_at' => $this->legacy->now_mysql(),
                ),
                array('%d', '%s', '%s', '%s', '%s')
            );
            $this->legacy->clear_feed_rate_limit_state($user_id);
            $this->legacy->audit($user_id, 'twelve_data_key.saved', array('status' => 'ok'));
        }

        return rest_ensure_response(array('ok' => true, 'status' => 'ok'));
    }

    public function delete_twelve_data_key() {
        global $wpdb;
        $user_id = get_current_user_id();
        $provider = get_class($this->legacy)::TWELVE_PROVIDER;
        $wpdb->delete($this->legacy->table('integrations'), array('user_id' => $user_id, 'provider' => $provider), array('%d', '%s'));
        $this->legacy->audit($user_id, 'twelve_data_key.deleted', array());
        return rest_ensure_response(array('ok' => true, 'status' => 'missing'));
    }

    public function get_instruments() {
        return rest_ensure_response($this->legacy->instrument_specs());
    }

    public function get_user_watchlist() {
        $user_id = get_current_user_id();
        $settings = $this->legacy->get_settings($user_id);
        return rest_ensure_response(array(
            'watchlist' => $settings['watchlist'],
            'supported' => array_keys($this->legacy->instrument_specs()),
        ));
    }

    public function post_user_watchlist(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $current = $this->legacy->get_settings($user_id);
        $symbols = isset($payload['watchlist']) && is_array($payload['watchlist']) ? $payload['watchlist'] : array();
        $validated = $this->legacy->validate_watchlist_symbols($symbols);
        $this->legacy->save_watchlist($user_id, $validated);
        $this->legacy->invalidate_watchlist_snapshot_if_changed($user_id, $current['watchlist'], $validated, 'post_user_watchlist');
        $persisted_settings = $this->legacy->get_settings($user_id);
        $this->legacy->audit($user_id, 'watchlist.saved', array('watchlist' => $persisted_settings['watchlist']));
        return rest_ensure_response(array('ok' => true, 'watchlist' => $persisted_settings['watchlist']));
    }

    public function post_watchlist_add(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $symbols = $this->legacy->sanitize_symbols(array($payload['symbol'] ?? ''));
        $symbol = isset($symbols[0]) ? $symbols[0] : '';
        if ($symbol === '') {
            return new WP_Error('smc_sf_watchlist_symbol_missing', 'Symbol is required.', array('status' => 400));
        }
        if (!$this->legacy->is_supported_symbol($symbol)) {
            return new WP_Error('smc_sf_watchlist_unsupported', 'Symbol not supported: ' . $symbol, array('status' => 400));
        }

        $settings = $this->legacy->get_settings($user_id);
        $previous_watchlist = $settings['watchlist'];
        $watchlist = $previous_watchlist;
        if (!in_array($symbol, $watchlist, true)) {
            $next_watchlist = $watchlist;
            $next_watchlist[] = $symbol;
            $next_watchlist = array_slice($next_watchlist, 0, 24);
            $this->legacy->save_watchlist($user_id, $next_watchlist);
            $persisted_settings = $this->legacy->get_settings($user_id);
            $watchlist = $persisted_settings['watchlist'];
            $this->legacy->invalidate_watchlist_snapshot_if_changed($user_id, $previous_watchlist, $watchlist, 'post_watchlist_add');
            $this->legacy->audit($user_id, 'watchlist.add', array('symbol' => $symbol));
        } else {
            $this->legacy->log_watchlist_snapshot_skip($user_id, 'post_watchlist_add');
        }

        return rest_ensure_response(array('ok' => true, 'watchlist' => $watchlist));
    }

    public function post_watchlist_remove(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $symbols = $this->legacy->sanitize_symbols(array($payload['symbol'] ?? ''));
        $symbol = isset($symbols[0]) ? $symbols[0] : '';
        if ($symbol === '') {
            return new WP_Error('smc_sf_watchlist_symbol_missing', 'Symbol is required.', array('status' => 400));
        }

        $settings = $this->legacy->get_settings($user_id);
        $previous_watchlist = $settings['watchlist'];
        $watchlist = array_values(array_filter($previous_watchlist, function ($w) use ($symbol) {
            return $w !== $symbol;
        }));
        $this->legacy->save_watchlist($user_id, $watchlist);
        $persisted_settings = $this->legacy->get_settings($user_id);
        $watchlist = $persisted_settings['watchlist'];
        $this->legacy->invalidate_watchlist_snapshot_if_changed($user_id, $previous_watchlist, $watchlist, 'post_watchlist_remove');
        $wpdb->delete($this->legacy->table('snapshots'), array('user_id' => $user_id, 'symbol' => $symbol), array('%d', '%s'));
        $this->legacy->audit($user_id, 'watchlist.remove', array('symbol' => $symbol));

        return rest_ensure_response(array('ok' => true, 'watchlist' => $watchlist));
    }

    public function get_user_risk_profile() {
        return rest_ensure_response($this->legacy->get_risk_profile(get_current_user_id()));
    }

    public function post_user_risk_profile(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $current = $this->legacy->get_risk_profile($user_id);
        $profile = array(
            'tier' => in_array(isset($payload['tier']) ? $payload['tier'] : '', array('conservative', 'balanced', 'aggressive'), true) ? $payload['tier'] : $current['tier'],
            'maxConcurrentTrades' => $this->legacy->int_between($payload, 'maxConcurrentTrades', 1, 10, $current['maxConcurrentTrades']),
            'perTradePct' => $this->legacy->float_between($payload, 'perTradePct', 0.1, 5.0, $current['perTradePct']),
            'dailyMaxPct' => $this->legacy->float_between($payload, 'dailyMaxPct', 0.1, 20.0, $current['dailyMaxPct']),
            'ddCapPct' => $this->legacy->float_between($payload, 'ddCapPct', 0.1, 50.0, $current['ddCapPct']),
            'cooldownMin' => $this->legacy->int_between($payload, 'cooldownMin', 0, 1440, $current['cooldownMin']),
            'updatedAt' => gmdate('c'),
        );

        $existing = $this->legacy->get_account_blob($user_id);
        $existing['riskProfile'] = array_merge(
            $this->legacy->get_risk_profile($user_id),
            $profile
        );
        $this->legacy->replace_json('account_snapshots', array(
            'user_id' => $user_id,
            'data' => $existing,
            'updated_at' => $this->legacy->now_mysql(),
        ));

        $current_settings = $this->legacy->get_settings($user_id);
        $current_settings['riskAllocation'] = array_merge(
            is_array($current_settings['riskAllocation'] ?? null) ? $current_settings['riskAllocation'] : array(),
            array(
                'perTradePct' => $profile['perTradePct'], 
                'dailyMaxPct' => $profile['dailyMaxPct'], 
                'ddCapPct' => $profile['ddCapPct'],
            )
        );
        $this->legacy->replace_json('user_settings', array(
            'user_id' => $user_id,
            'settings' => $current_settings,
            'updated_at' => $this->legacy->now_mysql(),
        ));

        $this->legacy->audit($user_id, 'risk_profile.updated', $profile);
        return rest_ensure_response(array('ok' => true));
    }
}
