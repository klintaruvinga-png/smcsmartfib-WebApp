<?php
namespace SMC\SuperFib\Service;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

final class SnapshotService {
    private $legacy;

    public function __construct($legacy) {
        $this->legacy = $legacy;
    }

    public function get_snapshot() {
        $user_id = get_current_user_id();
        $snapshot = $this->legacy->ensure_engine_snapshot($user_id);
        return $this->legacy->no_cache_response($snapshot);
    }

    public function post_snapshot(WP_REST_Request $request) {
        global $wpdb;

        $permission = $this->legacy->permission_user();
        if ($permission !== true) {
            return $permission;
        }

        $user_id = get_current_user_id();
        $payload = $request->get_json_params();
        if (!is_array($payload) || !isset($payload['symbol'])) {
            return new WP_REST_Response(array('error' => 'Invalid payload'), 400);
        }

        $payload = $this->normalize_snapshot_payload_compat($payload);
        $symbol = $this->legacy->map_symbol_aliases(strtoupper(sanitize_text_field($payload['symbol'])));
        $normalized_symbol = isset($payload['normalized_symbol'])
            ? $this->legacy->map_symbol_aliases(strtoupper(sanitize_text_field($payload['normalized_symbol'])))
            : $symbol;
        $freshness_raw = isset($payload['freshness']) ? sanitize_text_field($payload['freshness']) : '';
        $snapshot_state = $this->legacy->mt5_freshness_to_snapshot_state($freshness_raw);
        $requested_source = array_key_exists('source', $payload) ? strtolower(trim((string) $payload['source'])) : 'mt5';

        if ($requested_source !== 'mt5') {
            $this->legacy->audit($user_id, 'mt5_snapshot.invalid_source', array(
                'level' => 'ERROR',
                'symbol' => $normalized_symbol,
                'requested_source' => $requested_source,
            ));
            return rest_ensure_response(array('ok' => true));
        }

        $existing_snapshot = $this->legacy->get_snapshot_row($user_id, $normalized_symbol, 'mt5');
        $previous_snapshot_state = is_array($existing_snapshot) && isset($existing_snapshot['state'])
            ? (string) $existing_snapshot['state']
            : null;
        $persisted_snapshot_state = null;
        $snapshot_write_applied = false;

        if (isset($payload['tick'])) {
            $tick = $payload['tick'];
            $bid = isset($tick['bid']) ? (float) $tick['bid'] : 0;
            $ask = isset($tick['ask']) ? (float) $tick['ask'] : 0;
            $spread = isset($tick['spread']) ? (int) $tick['spread'] : 0;
            $timestamp_mysql = $this->legacy->normalize_market_timestamp(isset($tick['timestamp']) ? $tick['timestamp'] : null, $this->legacy->now_mysql());
            $tick_source = 'mt5';
            $tick_snapshot_state = 'live';

            $mid = ($bid + $ask) / 2;
            $changePct1d = 0;

            $snapshot_write_applied = $wpdb->replace(
                $this->legacy->table('snapshots'),
                array(
                    'user_id' => $user_id,
                    'symbol' => $normalized_symbol,
                    'bid' => $bid,
                    'ask' => $ask,
                    'mid' => $mid,
                    'spread' => $spread,
                    'change_pct_1d' => $changePct1d,
                    'source' => $tick_source,
                    'state' => $tick_snapshot_state,
                    'updated_at' => $timestamp_mysql,
                ),
                array('%d', '%s', '%f', '%f', '%f', '%d', '%f', '%s', '%s', '%s')
            ) !== false;
            $persisted_snapshot_state = $tick_snapshot_state;
        } elseif ($freshness_raw !== '') {
            $snapshot_write_applied = $wpdb->update(
                $this->legacy->table('snapshots'),
                array(
                    'state' => $snapshot_state,
                    'source' => 'mt5',
                ),
                array(
                    'user_id' => $user_id,
                    'symbol' => $normalized_symbol,
                ),
                array('%s', '%s'),
                array('%d', '%s')
            ) !== false;
            $persisted_snapshot_state = $snapshot_state;
        }

        if ($snapshot_write_applied && $persisted_snapshot_state !== null) {
            $was_live = $previous_snapshot_state === 'live';
            $is_live = $persisted_snapshot_state === 'live';
            if ($was_live !== $is_live) {
                $watchlist = $this->legacy->get_settings($user_id)['watchlist'];
                if (in_array($normalized_symbol, $watchlist, true)) {
                    $this->legacy->delete_engine_snapshot($user_id);
                }
            }
        }

        if (isset($payload['candle_m1'])) {
            $candle = $payload['candle_m1'];
            $timeframe = '1min';
            $candle_time = $this->legacy->normalize_market_timestamp(isset($candle['timestamp']) ? $candle['timestamp'] : null, $this->legacy->now_mysql());

            $wpdb->replace(
                $this->legacy->table('candles'),
                array(
                    'user_id' => $user_id,
                    'symbol' => $normalized_symbol,
                    'timeframe' => $timeframe,
                    'candle_time' => $candle_time,
                    'open' => (float) $candle['open'],
                    'high' => (float) $candle['high'],
                    'low' => (float) $candle['low'],
                    'close' => (float) $candle['close'],
                    'volume' => isset($candle['volume']) ? (string) $candle['volume'] : null,
                    'source' => 'mt5',
                    'created_at' => $this->legacy->now_mysql(),
                ),
                array('%d', '%s', '%s', '%s', '%f', '%f', '%f', '%f', '%s', '%s', '%s')
            );
        }

        if (isset($payload['freshness'])) {
            $freshness = strtoupper($freshness_raw);
            set_transient('smc_sf_freshness_' . $user_id . '_' . $normalized_symbol, $freshness, 300);
        }

        if (isset($payload['session'])) {
            $session = sanitize_text_field($payload['session']);
            set_transient('smc_sf_session_' . $user_id . '_' . $normalized_symbol, $session, 300);
        }

        $this->legacy->audit($user_id, 'mt5_snapshot.processed', array(
            'symbol' => $symbol,
            'normalized_symbol' => $normalized_symbol,
            'has_tick' => isset($payload['tick']),
            'has_candle' => isset($payload['candle_m1']),
            'freshness' => $payload['freshness'] ?? null,
            'session' => $payload['session'] ?? null,
            'is_synthetic' => $payload['is_synthetic'] ?? false,
        ));

        return rest_ensure_response(array('ok' => true));
    }

    private function normalize_snapshot_payload_compat(array $payload): array {
        if (!isset($payload['tick']) && (isset($payload['bid']) || isset($payload['ask']))) {
            $payload['tick'] = array(
                'bid' => $payload['bid'] ?? null,
                'ask' => $payload['ask'] ?? null,
                'spread' => $payload['spread'] ?? 0,
                'timestamp' => !empty($payload['quote_time'])
                    ? $payload['quote_time']
                    : ($payload['timestamp'] ?? null),
            );
        } elseif (isset($payload['tick']) && is_array($payload['tick']) && !isset($payload['tick']['timestamp'])) {
            $payload['tick']['timestamp'] = !empty($payload['quote_time'])
                ? $payload['quote_time']
                : ($payload['timestamp'] ?? null);
        }

        if (!isset($payload['candle_m1']) && isset($payload['candle']) && is_array($payload['candle'])) {
            $payload['candle_m1'] = $payload['candle'];
        }

        if (!isset($payload['candle_m1']) && !empty($payload['candles']) && is_array($payload['candles'])) {
            $first = reset($payload['candles']);
            if (is_array($first)) {
                if (isset($first['tick_volume']) && !isset($first['volume'])) {
                    $first['volume'] = $first['tick_volume'];
                }
                if (isset($first['time']) && !isset($first['timestamp'])) {
                    $first['timestamp'] = $first['time'];
                }
                $payload['candle_m1'] = $first;
            }
        }

        if (isset($payload['candle_m1']) && is_array($payload['candle_m1']) && isset($payload['candle_m1']['time']) && !isset($payload['candle_m1']['timestamp'])) {
            $payload['candle_m1']['timestamp'] = $payload['candle_m1']['time'];
        }

        return $payload;
    }
}
