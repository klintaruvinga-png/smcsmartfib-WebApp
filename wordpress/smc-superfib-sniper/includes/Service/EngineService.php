<?php
namespace SMC\SuperFib\Service;

use WP_REST_Request;

final class EngineService {
    private $legacy;

    public function __construct($legacy) {
        $this->legacy = $legacy;
    }

    public function get_regimes() {
        $user_id = get_current_user_id();
        $snapshot = $this->legacy->ensure_engine_snapshot($user_id);
        return rest_ensure_response($snapshot['regimes'] ?? array());
    }

    public function post_regime(WP_REST_Request $request) {
        $this->legacy->audit(get_current_user_id(), 'regime.posted', (array) $request->get_json_params());
        return rest_ensure_response(array('ok' => true));
    }

    public function get_live_signals(WP_REST_Request $request = null) {
        $user_id = get_current_user_id();
        $snapshot_was_computed = false;
        $snapshot = $this->legacy->ensure_engine_snapshot($user_id, false, $snapshot_was_computed);
        $settings = $this->legacy->get_settings($user_id);
        $watchlist_symbols = is_array($snapshot['meta']['watchlist'] ?? null)
            ? $snapshot['meta']['watchlist']
            : ($settings['watchlist'] ?? array());
        $scope = $request ? sanitize_text_field((string) ($request->get_param('scope') ?? 'watchlist')) : 'watchlist';
        $symbols = ($scope === 'global') ? array() : $watchlist_symbols;

        $promotion_candidates = array();
        if (is_array($snapshot['candidateSignals'] ?? null)) {
            $promotion_candidates = $snapshot['candidateSignals'];
        } elseif ($snapshot_was_computed && is_array($snapshot['signals'] ?? null)) {
            $promotion_candidates = $snapshot['signals'];
        }

        if (empty($promotion_candidates)) {
            $diagnostics = is_array($snapshot['diagnostics'] ?? null) ? $snapshot['diagnostics'] : array();
            $has_blocked_symbols = false;
            foreach ($diagnostics as $diagnostic) {
                if (!is_array($diagnostic)) {
                    continue;
                }
                $engine_blocker = strtoupper((string) ($diagnostic['engineBlocker'] ?? 'OK'));
                $price_state    = strtolower((string) ($diagnostic['priceState'] ?? 'live'));
                $candle_state   = strtolower((string) ($diagnostic['candleState'] ?? 'live'));
                if (
                    $engine_blocker !== 'OK'
                    || $price_state !== 'live'
                    || in_array($candle_state, array('stale', 'offline', 'missing', 'closed_session'), true)
                ) {
                    $has_blocked_symbols = true;
                    break;
                }
            }

            if ($snapshot_was_computed || $has_blocked_symbols) {
                $log_key = 'smc_sf_empty_candidates_log_' . (int) $user_id;
                if (!get_transient($log_key)) {
                    error_log(sprintf(
                        '[SMC_SF_SIGNAL_BOARD] empty_candidate_signals user_id=%d snapshotComputed=%s watchlistCount=%d diagnosticsCount=%d hasBlockedSymbols=%s',
                        (int) $user_id,
                        $snapshot_was_computed ? 'true' : 'false',
                        is_array($symbols) ? count($symbols) : 0,
                        count($diagnostics),
                        $has_blocked_symbols ? 'true' : 'false'
                    ));
                    set_transient($log_key, 1, 300);
                }
            }
        }

        $this->legacy->reconcile_live_signal_board(
            (int) $user_id,
            $watchlist_symbols,
            $promotion_candidates,
            is_array($snapshot['diagnostics'] ?? null) ? $snapshot['diagnostics'] : array()
        );
        $board_size = $this->legacy->resolve_signal_board_size($user_id);
        $count_symbols = ($scope === 'global') ? array() : $watchlist_symbols;
        return $this->legacy->no_cache_response(array(
            'signals' => $this->legacy->read_live_signal_board((int) $user_id, $symbols, $board_size),
            'polledAt' => gmdate('c'),
            'meta' => array(
                'boardSize' => $board_size,
                'totalActive' => $this->legacy->count_live_signal_board((int) $user_id, $count_symbols),
            ),
        ));
    }

    public function post_signal(WP_REST_Request $request) {
        $this->legacy->audit(get_current_user_id(), 'signal.posted', (array) $request->get_json_params());
        return rest_ensure_response(array('ok' => true));
    }

    public function get_ladders(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $symbol = strtoupper(sanitize_text_field($request->get_param('symbol')));
        $snapshot = $this->legacy->ensure_engine_snapshot($user_id);
        $plans = $snapshot['plans'] ?? array();
        if ($symbol) {
            $plans = array_values(array_filter($plans, function ($plan) use ($symbol) {
                return isset($plan['symbol']) && $plan['symbol'] === $symbol;
            }));
        }
        return $this->legacy->no_cache_response($plans);
    }

    public function post_execute_signals(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $ids = isset($payload['signalIds']) && is_array($payload['signalIds']) ? $payload['signalIds'] : array();
        $queued = 0;

        foreach ($ids as $signal_id) {
            $signal_id = sanitize_text_field($signal_id);
            $signal = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$this->legacy->table('signals')} WHERE id = %s AND user_id = %d",
                $signal_id,
                $user_id
            ), ARRAY_A);

            if (!$signal || (int) $signal['backend_confirmed'] !== 1 || $signal['status'] !== 'READY') {
                $this->legacy->audit($user_id, 'signals.execute.rejected', array(
                    'signal_id' => $signal_id,
                    'reason' => !$signal ? 'not_found' : ((int) $signal['backend_confirmed'] !== 1 ? 'not_confirmed' : 'not_ready'),
                ));
                continue;
            }

            $plan_row = $wpdb->get_row($wpdb->prepare(
                "SELECT plan FROM {$this->legacy->table('trade_plans')} WHERE signal_id = %s AND user_id = %d",
                $signal_id,
                $user_id
            ), ARRAY_A);

            if (!$plan_row) {
                continue;
            }

            $plan = json_decode($plan_row['plan'], true);
            foreach (array('e1', 'e2', 'e3') as $stage) {
                $stage_lots = isset($plan['lotSize'][$stage]) ? (float) $plan['lotSize'][$stage] : 0.0;
                if ($stage_lots < 0.01) {
                    continue;
                }

                $order_id = 'ord-' . substr(md5($signal_id . '|' . $stage), 0, 16);
                $tp_key = 'tp' . substr($stage, 1);
                $order = array(
                    'id' => $order_id,
                    'symbol' => $signal['symbol'],
                    'direction' => $signal['direction'],
                    'type' => 'LIMIT',
                    'price' => $plan['entries'][$stage],
                    'lots' => $stage_lots,
                    'sl' => isset($plan['stops'][$stage]) ? $plan['stops'][$stage] : $plan['sl'],
                    'tp' => isset($plan['tps'][$tp_key]) ? $plan['tps'][$tp_key] : $plan['tps']['tp1'],
                    'placedAt' => gmdate('c'),
                    'state' => 'pending-sync',
                );

                $wpdb->replace(
                    $this->legacy->table('trade_queue'),
                    array(
                        'id' => $order_id,
                        'user_id' => $user_id,
                        'signal_id' => $signal_id,
                        'payload' => wp_json_encode($order),
                        'state' => 'pending-sync',
                        'created_at' => $this->legacy->now_mysql(),
                    ),
                    array('%s', '%d', '%s', '%s', '%s', '%s')
                );
                $queued++;
            }
        }

        $this->legacy->audit($user_id, 'signals.executed', array('signalIds' => $ids, 'queued' => $queued));
        return rest_ensure_response(array('ok' => true, 'queued' => $queued));
    }

    public function post_engine_batch(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        $symbols = isset($payload['symbols']) ? $this->legacy->sanitize_symbols($payload['symbols']) : $this->legacy->get_settings($user_id)['watchlist'];
        foreach ($symbols as $sym) {
            delete_transient('smc_sf_qt_' . $user_id . '_' . md5($sym));
            delete_transient('smc_sf_ct_' . $user_id . '_' . md5($sym . '|15min'));
            delete_transient($this->legacy->rl_transient_key($user_id, $sym));
        }
        $snapshot = $this->legacy->ensure_engine_snapshot($user_id, true);
        return rest_ensure_response(array(
            'ok' => true,
            'diagnostics' => isset($snapshot['diagnostics']) ? $snapshot['diagnostics'] : array(),
        ));
    }
}
