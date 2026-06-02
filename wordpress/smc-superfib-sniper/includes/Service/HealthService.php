<?php
namespace SMC\SuperFib\Service;

use WP_REST_Response;

final class HealthService {
    private $legacy;

    public function __construct($legacy) {
        $this->legacy = $legacy;
    }

    public function get_health() {
        $user_id = get_current_user_id();

        if (!$user_id) {
            $user_id = (int) wp_validate_auth_cookie('', 'logged_in');
            if ($user_id) {
                wp_set_current_user($user_id);
            }
        }

        if (!$user_id) {
            return rest_ensure_response(array(
                'status'  => 'ok',
                'auth'    => false,
                'message' => 'System is operational. Log in for detailed diagnostics.',
            ));
        }

        return $this->legacy->no_cache_response($this->build_health_payload($user_id));
    }

    public function get_admin_health() {
        return $this->legacy->no_cache_response($this->build_health_payload(get_current_user_id()));
    }

    public function get_health_payload_for_user($user_id) {
        return $this->build_health_payload($user_id);
    }

    private function build_health_payload($user_id) {
        $key_status = $this->legacy->get_twelve_key_status($user_id);
        $last_batch = $this->legacy->latest_timestamp('snapshots', $user_id, 'updated_at');
        $last_run = $this->legacy->latest_timestamp('engine_runs', $user_id, 'created_at');
        $run_age      = $last_run ? (time() - strtotime($last_run . ' UTC')) : PHP_INT_MAX;
        $backend_sync = $run_age <= 120 ? 'live' : ($last_run ? 'stale' : 'offline');

        $batch_age = $last_batch ? (time() - strtotime($last_batch . ' UTC')) : PHP_INT_MAX;

        $settings = $this->legacy->get_settings($user_id);
        $feed_has_stale_symbols = false;
        $feed_any_rate_limited = false;
        $feed_requires_twelve_data = false;
        $mt5_live_symbols = 0;
        $watchlist_count = count($settings['watchlist']);
        foreach ($settings['watchlist'] as $symbol) {
            $mt5_authority = $this->legacy->is_mt5_authoritative($user_id, $symbol);
            if (!$mt5_authority) {
                $feed_requires_twelve_data = true;
            }
            $cached_price = $this->legacy->get_cached_price($user_id, $symbol, $settings['staleThresholdSec']);
            $mt5_price_live = $cached_price
                && ($cached_price['source'] ?? '') === 'mt5'
                && ($cached_price['state'] ?? '') === 'live';
            $price_age = isset($cached_price['age_sec']) ? (int) $cached_price['age_sec'] : PHP_INT_MAX;
            $symbol_rate_limited = $this->legacy->is_feed_rate_limited($user_id, $symbol);
            $mt5_candles_live = false;
            if ($mt5_price_live) {
                $candles = $this->legacy->fetch_candles($user_id, $symbol, '15min', 30);
                $last_candle = !empty($candles) ? end($candles) : null;
                $mt5_candles_live = count($candles) >= 30
                    && $last_candle
                    && $this->legacy->is_chart_candle_fresh($last_candle['time'] ?? null, '15min');
            }

            $is_equity_off_session = $this->legacy->is_equity_index_off_session($symbol);

            if ($mt5_price_live && $mt5_candles_live) {
                $mt5_live_symbols++;
            } elseif ($is_equity_off_session) {
                error_log(sprintf(
                    '[PHASE0_SOAK] INDEX_CLOSED: symbol=%s | session_gap=true | excluded_from_stale_check',
                    $symbol
                ));
            } elseif ($mt5_price_live || !$cached_price || ($cached_price['state'] ?? 'offline') !== 'live') {
                $feed_has_stale_symbols = true;
            }
            if (!$mt5_authority && $symbol_rate_limited) {
                $feed_any_rate_limited = true;
            }

            error_log(sprintf(
                '[PHASE0_SOAK] Health check: symbol=%s | mt5_live=%s | mt5_candles_live=%s | rate_limited=%s | age_sec=%d',
                $symbol,
                $mt5_price_live ? 'true' : 'false',
                $mt5_candles_live ? 'true' : 'false',
                $symbol_rate_limited ? 'true' : 'false',
                $price_age
            ));

            if ($symbol_rate_limited || !$mt5_price_live || !$mt5_candles_live) {
                $this->legacy->log_feed_debug('health.symbol', array(
                    'symbol' => $symbol,
                    'mt5_authority' => $mt5_authority,
                    'price_source' => $cached_price['source'] ?? 'none',
                    'price_state' => $cached_price['state'] ?? 'missing',
                    'price_age_sec' => isset($cached_price['age_sec']) ? (int) $cached_price['age_sec'] : null,
                    'mt5_price_live' => $mt5_price_live,
                    'mt5_candles_live' => $mt5_candles_live,
                    'rate_limited' => $symbol_rate_limited,
                ));
            }
        }

        $all_symbols_mt5_live = $watchlist_count > 0 && $mt5_live_symbols === $watchlist_count;

        if ($all_symbols_mt5_live) {
            $feed_status = 'live';
        } elseif ($feed_any_rate_limited) {
            $feed_status = 'rate-limited';
        } elseif ($feed_requires_twelve_data && $key_status !== 'ok') {
            $feed_status = 'blocked';
        } elseif (!$feed_has_stale_symbols && $batch_age <= 120) {
            $feed_status = 'live';
        } else {
            $feed_status = 'stale';
        }

        error_log(sprintf(
            '[PHASE0_SOAK] Final feed status: all_symbols_mt5_live=%s | feed_any_rate_limited=%s | key_status=%s | batch_age=%d | RESULT=%s',
            $all_symbols_mt5_live ? 'true' : 'false',
            $feed_any_rate_limited ? 'true' : 'false',
            $key_status,
            $batch_age,
            $feed_status
        ));

        $price_feed = ($feed_status === 'live') ? 'live' : (($feed_status === 'blocked') ? 'blocked' : 'stale');

        if ($feed_status !== 'live' || $feed_any_rate_limited || $feed_has_stale_symbols) {
            $this->legacy->log_feed_debug('health.summary', array(
                'feed_status' => $feed_status,
                'price_feed' => $price_feed,
                'backend_sync' => $backend_sync,
                'watchlist_count' => $watchlist_count,
                'mt5_live_symbols' => $mt5_live_symbols,
                'requires_twelve_data' => $feed_requires_twelve_data,
                'stale_symbols' => $feed_has_stale_symbols,
                'rate_limited' => $feed_any_rate_limited,
            ));
        }

        if (!$last_run) {
            $engine_run_state = 'failed';
        } elseif ($run_age <= 10) {
            $engine_run_state = 'live';
        } elseif ($run_age <= 120) {
            $engine_run_state = 'cached';
        } else {
            $engine_run_state = 'stale';
        }

        $snapshot = $this->legacy->get_engine_snapshot($user_id);

        return array(
            'backendSync' => $backend_sync,
            'priceFeed' => $price_feed,
            'feedStatus' => $feed_status,
            'engineRunState' => $engine_run_state,
            'twelveDataKey' => $key_status === 'ok' ? 'present' : 'missing',
            'twelveDataKeyStatus' => $key_status,
            'lastBatchAt' => $this->legacy->to_iso($last_batch),
            'lastEngineRunAt' => $this->legacy->to_iso($last_run),
            'perSymbolDiagnostics' => is_array($snapshot) ? ($snapshot['diagnostics'] ?? array()) : array(),
        );
    }
}
