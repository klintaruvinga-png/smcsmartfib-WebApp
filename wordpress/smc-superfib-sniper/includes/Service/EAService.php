<?php
namespace SMC\SuperFib\Service;

use WP_REST_Request;

final class EAService {
    private $legacy;

    public function __construct($legacy) {
        $this->legacy = $legacy;
    }

    public function post_ea_fib_levels(WP_REST_Request $request) {
        global $wpdb;

        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            return new \WP_Error('invalid_payload', 'JSON body required', array('status' => 400));
        }

        $user_id = get_current_user_id();

        if (!isset($payload['symbol']) || !isset($payload['levels'])) {
            return new \WP_Error('missing_fields', 'symbol and levels are required', array('status' => 400));
        }

        $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper(sanitize_text_field($payload['symbol'])));
        if ($symbol === '') {
            return new \WP_Error('invalid_symbol', 'symbol must be a non-empty alphanumeric string', array('status' => 400));
        }

        $levels_payload = $payload['levels'];
        if (!is_array($levels_payload)) {
            return new \WP_Error('invalid_levels', 'levels must be an array', array('status' => 400));
        }

        $valid_families = array('LTF_SF', 'HTF_AF');
        $valid_timeframes = array('M15', 'H1', 'H4', 'D1');
        $valid_ratios = array(-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300);
        $calculated_at = gmdate('Y-m-d H:i:s');
        $inserted = 0;
        $failed = 0;
        $table = $wpdb->prefix . 'smc_sf_fib_levels';

        foreach ($levels_payload as $tf_entry) {
            if (!is_array($tf_entry) || !isset($tf_entry['timeframe'])) {
                continue;
            }

            $timeframe = sanitize_text_field(strtoupper((string) $tf_entry['timeframe']));
            if (!in_array($timeframe, $valid_timeframes, true)) {
                continue;
            }

            $families_map = array(
                'LTF_SF' => isset($tf_entry['ltf_sf']) && is_array($tf_entry['ltf_sf']) ? $tf_entry['ltf_sf'] : array(),
                'HTF_AF' => isset($tf_entry['htf_af']) && is_array($tf_entry['htf_af']) ? $tf_entry['htf_af'] : array(),
            );

            foreach ($families_map as $family => $levels) {
                if (!in_array($family, $valid_families, true)) {
                    continue;
                }

                foreach ($levels as $level) {
                    if (!is_array($level) || !isset($level['ratio'], $level['price'])) {
                        continue;
                    }

                    $ratio = (float) $level['ratio'];
                    $price = (float) $level['price'];

                    if (!in_array($ratio, $valid_ratios, false)) {
                        continue;
                    }

                    $result = $wpdb->replace(
                        $table,
                        array(
                            'user_id' => $user_id,
                            'symbol' => $symbol,
                            'timeframe' => $timeframe,
                            'family' => $family,
                            'ratio' => $ratio,
                            'price' => $price,
                            'source' => 'mt5',
                            'calculated_at' => $calculated_at,
                        ),
                        array('%d', '%s', '%s', '%s', '%f', '%f', '%s', '%s')
                    );

                    if ($result === false) {
                        $failed++;
                        if (!empty($wpdb->last_error)) {
                            error_log(sprintf('[SMC_SF] ea/fib-levels upsert failed symbol=%s tf=%s family=%s ratio=%s err=%s',
                                $symbol, $timeframe, $family, $ratio, $wpdb->last_error));
                        }
                    } else {
                        $inserted++;
                    }
                }
            }
        }

        error_log(sprintf('[SMC_SF] ea/fib-levels ingested symbol=%s levels_written=%d failed=%d user_id=%d',
            $symbol, $inserted, $failed, $user_id));

        return rest_ensure_response(array(
            'ok' => $failed === 0,
            'symbol' => $symbol,
            'levels_written' => $inserted,
            'levels_failed' => $failed,
        ));
    }

    public function post_ea_regime_snapshot(WP_REST_Request $request) {
        global $wpdb;

        $payload = $request->get_json_params();
        if (!is_array($payload) || !isset($payload['regimes']) || !is_array($payload['regimes'])) {
            return new \WP_Error('invalid_payload', 'regimes array required', array('status' => 400));
        }

        if (!\SMC\SuperFib\Database\Schema::ensure_regime_snapshots_table()) {
            $detail = \SMC\SuperFib\Database\Schema::get_last_error() ?? 'dbDelta unavailable';
            error_log('SMC SuperFIB EA regime snapshot table init failed: ' . $detail);
            return new \WP_REST_Response(array(
                'error' => 'table_init_failed',
                'detail' => $detail,
            ), 500);
        }

        $user_id = get_current_user_id();
        $table = $wpdb->prefix . 'smc_sf_regime_snapshots';
        $valid_bias = array('BULL', 'BEAR', 'TRANSITIONAL');
        $valid_regimes = array('TRENDING', 'RANGING', 'CHOP');
        $calculated_at = gmdate('Y-m-d H:i:s');
        $written = 0;
        $failed = 0;

        foreach ($payload['regimes'] as $entry) {
            if (!is_array($entry) || empty($entry['symbol'])) {
                $failed++;
                continue;
            }

            $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper(sanitize_text_field($entry['symbol'])));
            $htf_bias = sanitize_text_field(strtoupper((string) ($entry['htf_bias'] ?? 'TRANSITIONAL')));
            $ltf_regime = sanitize_text_field(strtoupper((string) ($entry['ltf_regime'] ?? 'RANGING')));
            $chop_score = max(0.0, min(1.0, (float) ($entry['chop_score'] ?? 0.5)));
            $ema20_d1 = isset($entry['ema20_d1']) && is_numeric($entry['ema20_d1']) ? (float) $entry['ema20_d1'] : null;
            $atr14_h1 = isset($entry['atr14_h1']) && is_numeric($entry['atr14_h1']) ? (float) $entry['atr14_h1'] : null;
            $htf_bias_high = isset($entry['htf_bias_high']) && is_numeric($entry['htf_bias_high']) ? (float) $entry['htf_bias_high'] : null;
            $htf_bias_low = isset($entry['htf_bias_low']) && is_numeric($entry['htf_bias_low']) ? (float) $entry['htf_bias_low'] : null;

            if ($symbol === '' || !in_array($htf_bias, $valid_bias, true) || !in_array($ltf_regime, $valid_regimes, true)) {
                $failed++;
                continue;
            }

            $result = $wpdb->replace(
                $table,
                array(
                    'user_id' => $user_id,
                    'symbol' => $symbol,
                    'htf_bias' => $htf_bias,
                    'ltf_regime' => $ltf_regime,
                    'chop_score' => $chop_score,
                    'ema20_d1' => $ema20_d1,
                    'atr14_h1' => $atr14_h1,
                    'htf_bias_high' => $htf_bias_high,
                    'htf_bias_low' => $htf_bias_low,
                    'source' => 'mt5',
                    'calculated_at' => $calculated_at,
                ),
                array('%d', '%s', '%s', '%s', '%f', $ema20_d1 !== null ? '%f' : 'NULL', $atr14_h1 !== null ? '%f' : 'NULL', $htf_bias_high !== null ? '%f' : 'NULL', $htf_bias_low !== null ? '%f' : 'NULL', '%s', '%s')
            );

            if ($result !== false) {
                $written++;
            } else {
                $failed++;
                if (!empty($wpdb->last_error)) {
                    error_log(sprintf('[SMC_SF] ea/regime-snapshot upsert failed symbol=%s err=%s', $symbol, $wpdb->last_error));
                }
            }
        }

        error_log(sprintf('[SMC_SF] ea/regime-snapshot written=%d failed=%d user_id=%d', $written, $failed, $user_id));

        return rest_ensure_response(array(
            'ok' => $failed === 0,
            'written' => $written,
            'failed' => $failed,
        ));
    }

    public function post_ea_market_stream(WP_REST_Request $request) {
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $user_id = (int) $this->legacy->ea_request_value($request, $payload, 'user_id', 0);
        if ($user_id <= 0) {
            $user_id = $this->legacy->resolve_ea_user_id();
        }

        $user = get_userdata($user_id);
        if (!$user || !user_can($user, 'read')) {
            return new \WP_Error('smc_sf_user_invalid', 'user_id must reference a valid readable user.', array('status' => 403));
        }

        $phase2_trade_payload = $this->legacy->has_phase2_trade_telemetry_payload($payload);
        $schema_version = $this->legacy->sanitize_ea_text($payload['schema_version'] ?? '', 64);
        if ($phase2_trade_payload && $schema_version === '') {
            $this->legacy->audit($user_id, 'ea.trade_telemetry.rejected', array(
                'reason' => 'missing_schema_version',
                'symbol' => $payload['symbol'] ?? null,
                'account_id' => $payload['account_id'] ?? null,
                'terminal_id' => $payload['terminal_id'] ?? null,
            ));
            return new \WP_Error(
                'smc_sf_trade_telemetry_schema_required',
                'schema_version is required for Phase 2 trade telemetry payloads.',
                array('status' => 400)
            );
        }

        if (!$payload || !isset($payload['symbol'])) {
            $this->legacy->audit($user_id, 'ea.market_stream.invalid_payload', array('reason' => 'missing_symbol', 'payload' => $payload));
            return new \WP_Error('invalid_payload', 'Missing required symbol field', array('status' => 400));
        }

        $symbol = sanitize_text_field(strtoupper($payload['symbol']));
        if (!empty($payload['normalized_symbol'])) {
            $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper(sanitize_text_field($payload['normalized_symbol'])));
        }

        $symbol = $this->legacy->map_symbol_aliases($symbol);
        $timeframe = $this->legacy->normalize_mt5_timeframe($payload['timeframe'] ?? 'M15');
        $payload = $this->legacy->normalize_phase3_market_stream_payload($payload);

        $timestamp_raw = !empty($payload['quote_time'])
            ? $payload['quote_time']
            : (!empty($payload['timestamp']) ? $payload['timestamp'] : null);
        $snapshot_updated_at = $this->legacy->normalize_market_timestamp($timestamp_raw, $this->legacy->now_mysql());

        if (!isset($payload['candle']) && !empty($payload['candles']) && is_array($payload['candles'])) {
            $first = reset($payload['candles']);
            if (is_array($first)) {
                if (isset($first['tick_volume']) && !isset($first['volume'])) {
                    $first['volume'] = $first['tick_volume'];
                }
                $payload['candle'] = $first;
            }
            $candle_count = count($payload['candles']);
            if ($candle_count > 1) {
                error_log(sprintf(
                    '[SMC_SF] ea/market-stream: candles[] array has %d entries for symbol=%s; only candles[0] is stored. Multi-candle batch is Phase 3 scope.',
                    $candle_count,
                    $symbol
                ));
                $this->legacy->audit($user_id, 'ea.market_stream.multi_candle_batch_truncated', array(
                    'symbol' => $symbol,
                    'candle_count' => $candle_count,
                    'note' => 'Only candles[0] stored. Phase 3 will add full batch ingestion.',
                ));
            }
        }

        $phase3_freshness = $this->legacy->normalize_mt5_freshness_value($payload['freshness'] ?? '');
        $phase3_session = $this->legacy->normalize_mt5_session_value($payload['session'] ?? '');

        if ($this->legacy->is_phase3_market_stream_payload($payload)) {
            $phase3_validation_error = $this->legacy->validate_phase3_market_stream_payload($payload);
            if (!empty($phase3_validation_error)) {
                error_log(sprintf(
                    '[SMC_SF] ea/market-stream invalid Phase 3 payload symbol=%s field=%s',
                    $symbol,
                    $phase3_validation_error['field']
                ));
                $this->legacy->audit($user_id, 'ea.market_stream.invalid_phase3_payload', array(
                    'symbol' => $symbol,
                    'field' => $phase3_validation_error['field'],
                    'message' => $phase3_validation_error['message'],
                ));
                return new \WP_Error('invalid_phase3_payload', $phase3_validation_error['message'], array('status' => 400));
            }
        }

        if (!empty($timestamp_raw)) {
            $normalized_payload_timestamp = $this->legacy->normalize_market_timestamp($timestamp_raw, null);
            $data_timestamp = $normalized_payload_timestamp ? strtotime($normalized_payload_timestamp) : false;

            if ($data_timestamp === false) {
                $this->legacy->audit($user_id, 'ea.market_stream.stale_data_rejected', array(
                    'symbol' => $symbol,
                    'timestamp' => $timestamp_raw,
                    'normalized_timestamp' => $normalized_payload_timestamp,
                    'reason' => 'unparseable_timestamp',
                    'rejection_level' => 'payload',
                ));
                return new \WP_Error('stale_data', 'Rejected market data with unparseable timestamp', array('status' => 422));
            }

            $now_timestamp = time();
            $age_seconds = $now_timestamp - $data_timestamp;

            if ($age_seconds > 300) {
                $this->legacy->audit($user_id, 'ea.market_stream.stale_data_rejected', array(
                    'symbol' => $symbol,
                    'timestamp' => $timestamp_raw,
                    'normalized_timestamp' => $normalized_payload_timestamp,
                    'age_seconds' => $age_seconds,
                    'rejection_level' => 'payload',
                ));
                return new \WP_Error('stale_data', 'Rejected market data older than 300 seconds', array('status' => 422));
            }

            if ($age_seconds > 120) {
                error_log("MT5 DRIFT WARNING: {$symbol} | payload_age={$age_seconds}s | snapshot will write, candle gated separately");
            }
        }

        $inserted_snapshots = 0;
        $inserted_candles = 0;

        if (!isset($payload['bid'], $payload['ask'])) {
            return new \WP_Error('missing_prices', 'bid and ask are required.', array('status' => 400));
        }

        $bid = (float) $payload['bid'];
        $ask = (float) $payload['ask'];

        if (!is_finite($bid) || !is_finite($ask) || $bid <= 0 || $ask <= 0 || $bid > $ask) {
            $this->legacy->audit($user_id, 'ea.market_stream.invalid_prices', array(
                'symbol' => $symbol,
                'bid' => $bid,
                'ask' => $ask,
                'reason' => !is_finite($bid) || !is_finite($ask) ? 'non_finite' : ($bid <= 0 || $ask <= 0 ? 'non_positive' : 'bid_exceeds_ask'),
            ));
            return new \WP_Error('invalid_prices', 'bid and ask must be finite positive numbers with bid <= ask.', array('status' => 422));
        }

        $result = $this->legacy->upsert_mt5_snapshot($user_id, $symbol, $bid, $ask, $snapshot_updated_at, $phase3_freshness);
        if ($result) {
            $inserted_snapshots = 1;
            delete_transient('smc_sf_qt_' . $user_id . '_' . md5($symbol));
            delete_transient($this->legacy->rl_transient_key($user_id, $symbol));
        }

        if (!empty($payload['candle']) && is_array($payload['candle'])) {
            $candle = $payload['candle'];
            if (isset($candle['time'], $candle['open'], $candle['high'], $candle['low'], $candle['close'])) {
                $candle_ts = strtotime($candle['time']);
                $min_valid_ts = 946684800;
                if ($candle_ts === false || $candle_ts <= 0 || $candle_ts < $min_valid_ts) {
                    error_log("REGRESSION GUARD: Rejecting candle with invalid/epoch timestamp for {$symbol} | time={$candle['time']} | parsed_ts={$candle_ts} | min_valid={$min_valid_ts}");
                    $this->legacy->audit($user_id, 'ea.market_stream.invalid_candle_timestamp', array(
                        'symbol' => $symbol,
                        'candle_time' => $candle['time'],
                        'parsed_timestamp' => $candle_ts
                    ));
                } elseif (!$this->legacy->validate_ohlc($candle)) {
                    $this->legacy->audit($user_id, 'ea.market_stream.invalid_ohlc', array(
                        'symbol' => $symbol,
                        'timeframe' => $timeframe,
                        'open' => $candle['open'],
                        'high' => $candle['high'],
                        'low' => $candle['low'],
                        'close' => $candle['close'],
                    ));
                    error_log("OHLC GUARD: Rejecting M1 candle with invalid OHLC for {$symbol} | O={$candle['open']} H={$candle['high']} L={$candle['low']} C={$candle['close']}");
                } else {
                    $m1_stream_ts = !empty($timestamp_raw) ? $timestamp_raw : gmdate('c');
                    $result = $this->legacy->insert_mt5_candle($user_id, $symbol, $timeframe, $candle, $m1_stream_ts);
                    if ($result) {
                        $inserted_candles = 1;
                    } else {
                        error_log("MT5 CANDLE INSERT FAILED: {$symbol} | tf={$timeframe} | time={$candle['time']} | stream_timestamp={$m1_stream_ts}");
                    }
                }
            } else {
                error_log("MT5 CANDLE PAYLOAD INVALID: " . print_r($candle, true));
                $this->legacy->audit($user_id, 'ea.market_stream.invalid_candle', array(
                    'symbol' => $symbol,
                    'candle' => $candle
                ));
            }
        } elseif (isset($payload['candle'])) {
            error_log("MT5 CANDLE PAYLOAD INVALID (non-array) FOR SYMBOL: {$symbol}");
        }

        if (!empty($payload['candle_m15']) && is_array($payload['candle_m15'])) {
            $candle_m15 = $payload['candle_m15'];
            if (isset($candle_m15['time'], $candle_m15['open'], $candle_m15['high'], $candle_m15['low'], $candle_m15['close'])) {
                $candle_m15_ts = strtotime($candle_m15['time']);
                $min_valid_ts = 946684800;
                if ($candle_m15_ts === false || $candle_m15_ts <= 0 || $candle_m15_ts < $min_valid_ts) {
                    error_log("REGRESSION GUARD: Rejecting M15 candle with invalid/epoch timestamp for {$symbol} | time={$candle_m15['time']} | parsed_ts={$candle_m15_ts} | min_valid={$min_valid_ts}");
                    $this->legacy->audit($user_id, 'ea.market_stream.invalid_m15_candle_timestamp', array(
                        'symbol' => $symbol,
                        'candle_time' => $candle_m15['time'],
                        'parsed_timestamp' => $candle_m15_ts
                    ));
                } elseif (!$this->legacy->validate_ohlc($candle_m15)) {
                    $this->legacy->audit($user_id, 'ea.market_stream.invalid_ohlc', array(
                        'symbol' => $symbol,
                        'timeframe' => '15min',
                        'open' => $candle_m15['open'],
                        'high' => $candle_m15['high'],
                        'low' => $candle_m15['low'],
                        'close' => $candle_m15['close'],
                    ));
                    error_log("OHLC GUARD: Rejecting M15 candle with invalid OHLC for {$symbol} | O={$candle_m15['open']} H={$candle_m15['high']} L={$candle_m15['low']} C={$candle_m15['close']}");
                } else {
                    $m15_stream_ts = !empty($timestamp_raw) ? $timestamp_raw : gmdate('c');
                    $result = $this->legacy->insert_mt5_candle($user_id, $symbol, '15min', $candle_m15, $m15_stream_ts, 1800);
                    if ($result) {
                        $inserted_candles++;
                    } else {
                        error_log("MT5 M15 CANDLE INSERT FAILED: {$symbol} | timeframe=15min | time={$candle_m15['time']} | stream_timestamp={$m15_stream_ts}");
                    }
                }
            } else {
                error_log("MT5 M15 CANDLE PAYLOAD INVALID: " . print_r($candle_m15, true));
                $this->legacy->audit($user_id, 'ea.market_stream.invalid_m15_candle', array(
                    'symbol' => $symbol,
                    'candle_m15' => $candle_m15
                ));
            }
        }

        if ($phase3_freshness !== '') {
            set_transient('smc_sf_freshness_' . $user_id . '_' . $symbol, $phase3_freshness, 300);
        }

        if ($phase3_session !== '') {
            set_transient('smc_sf_session_' . $user_id . '_' . $symbol, $phase3_session, 300);
        }

        if ($inserted_snapshots > 0) {
            $this->legacy->insert_engine_heartbeat($user_id, array('source' => 'ea_push', 'symbol' => $symbol));
        }

        $trade_telemetry_counts = array(
            'account_telemetry_upserted' => 0,
            'positions_upserted' => 0,
            'orders_upserted' => 0,
            'positions_swept' => 0,
            'orders_swept' => 0,
        );
        if ($schema_version !== '') {
            $telemetry_result = $this->legacy->persist_phase2_trade_telemetry($request, $payload, $user_id);
            if (is_wp_error($telemetry_result)) {
                return $telemetry_result;
            }
            $trade_telemetry_counts = array_merge($trade_telemetry_counts, $telemetry_result);
        }

        if ($phase3_freshness !== '' || $phase3_session !== '') {
            error_log(sprintf(
                '[SMC_SF] ea/market-stream ingested symbol=%s freshness=%s session=%s',
                $symbol,
                $phase3_freshness !== '' ? $phase3_freshness : '(none)',
                $phase3_session !== '' ? $phase3_session : '(none)'
            ));
        }

        $this->legacy->audit($user_id, 'ea.market_stream.ingested', array(
            'symbol' => $symbol,
            'snapshots_inserted' => $inserted_snapshots,
            'candles_inserted' => $inserted_candles,
            'timestamp' => $timestamp_raw,
            'freshness' => $phase3_freshness !== '' ? $phase3_freshness : null,
            'session' => $phase3_session !== '' ? $phase3_session : null,
            'schema_version' => $schema_version !== '' ? $schema_version : null,
            'trade_telemetry' => $trade_telemetry_counts,
        ));

        return rest_ensure_response(array(
            'ok' => true,
            'symbol' => $symbol,
            'snapshots_inserted' => $inserted_snapshots,
            'candles_inserted' => $inserted_candles,
            'account_telemetry_upserted' => $trade_telemetry_counts['account_telemetry_upserted'],
            'positions_upserted' => $trade_telemetry_counts['positions_upserted'],
            'orders_upserted' => $trade_telemetry_counts['orders_upserted'],
            'positions_swept' => $trade_telemetry_counts['positions_swept'],
            'orders_swept' => $trade_telemetry_counts['orders_swept'],
            'server_time' => gmdate('c')
        ));
    }

    public function post_ea_heartbeat(WP_REST_Request $request) {
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $user_id = get_current_user_id();
        $account_id = $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'account_id', ''), 64);
        $terminal_id = $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'terminal_id', ''), 96);
        $broker = $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'broker', ''), 96);
        $broker_server = $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'broker_server', ''), 128);
        $ea_version = $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'ea_version', ''), 64);
        $terminal_build = $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'terminal_build', ''), 64);
        $connected = $this->legacy->sanitize_ea_bool($this->legacy->ea_request_value($request, $payload, 'connected', true));
        $timestamp = $this->legacy->normalize_market_timestamp($this->legacy->ea_request_value($request, $payload, 'timestamp', ''), $this->legacy->now_mysql());

        $this->legacy->insert_engine_heartbeat($user_id, array(
            'source' => 'explicit_heartbeat',
            'account_id' => $account_id,
            'terminal_id' => $terminal_id,
            'broker' => $broker,
            'broker_server' => $broker_server,
            'ea_version' => $ea_version,
            'terminal_build' => $terminal_build,
            'connected' => $connected,
            'timestamp' => $timestamp,
        ));

        error_log(sprintf(
            'SMC SuperFIB EA heartbeat received: user_id=%d account_id=%s terminal_id=%s connected=%s',
            $user_id,
            $account_id !== '' ? $account_id : 'unknown',
            $terminal_id !== '' ? $terminal_id : 'unknown',
            $connected ? 'true' : 'false'
        ));

        return rest_ensure_response(array(
            'ok' => true,
            'received' => true,
            'status' => 'live',
            'server_time' => gmdate('c'),
        ));
    }

    public function post_ea_account_sync(WP_REST_Request $request) {
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $user_id = get_current_user_id();
        $server_time = gmdate('c');
        $seen_at = $this->legacy->normalize_market_timestamp($this->legacy->ea_request_value($request, $payload, 'timestamp', $server_time), $this->legacy->now_mysql());
        $account_id = $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'account_id', ''), 64);
        $terminal_id = $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'terminal_id', ''), 96);
        $account_key = $this->legacy->ea_identity_key($account_id, $terminal_id);

        $existing = $this->legacy->get_account_blob($user_id);
        $bridge = isset($existing['eaBridge']) && is_array($existing['eaBridge']) ? $existing['eaBridge'] : array();
        $accounts = isset($bridge['accounts']) && is_array($bridge['accounts']) ? $bridge['accounts'] : array();
        $prior = isset($accounts[$account_key]) && is_array($accounts[$account_key]) ? $accounts[$account_key] : array();

        $record = array_merge($prior, array(
            'user_id' => $user_id,
            'account_id' => $account_id,
            'terminal_id' => $terminal_id,
            'broker' => $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'broker', ''), 96),
            'broker_server' => $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'broker_server', ''), 128),
            'currency' => $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'currency', ''), 16),
            'balance' => $this->legacy->sanitize_ea_number($this->legacy->ea_request_value($request, $payload, 'balance', 0)),
            'equity' => $this->legacy->sanitize_ea_number($this->legacy->ea_request_value($request, $payload, 'equity', 0)),
            'margin' => $this->legacy->sanitize_ea_number($this->legacy->ea_request_value($request, $payload, 'margin', 0)),
            'free_margin' => $this->legacy->sanitize_ea_number($this->legacy->ea_request_value($request, $payload, 'free_margin', 0)),
            'leverage' => $this->legacy->sanitize_ea_int($this->legacy->ea_request_value($request, $payload, 'leverage', 0)),
            'trade_allowed' => $this->legacy->sanitize_ea_bool($this->legacy->ea_request_value($request, $payload, 'trade_allowed', false)),
            'connected' => $this->legacy->sanitize_ea_bool($this->legacy->ea_request_value($request, $payload, 'connected', false)),
            'ea_version' => $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'ea_version', ''), 64),
            'terminal_build' => $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'terminal_build', ''), 64),
            'last_seen_at' => gmdate('c', strtotime($seen_at . ' UTC')),
            'raw_json' => $payload,
        ));

        $accounts[$account_key] = $record;
        $bridge['accounts'] = $accounts;
        $bridge['last_account_sync_at'] = $server_time;
        $existing['eaBridge'] = $bridge;

        $this->legacy->replace_json('account_snapshots', array(
            'user_id' => $user_id,
            'data' => $existing,
            'updated_at' => $this->legacy->now_mysql(),
        ));

        error_log(sprintf(
            'SMC SuperFIB EA account sync saved: user_id=%d account_id=%s terminal_id=%s',
            $user_id,
            $account_id !== '' ? $account_id : 'unknown',
            $terminal_id !== '' ? $terminal_id : 'unknown'
        ));

        return rest_ensure_response(array(
            'ok' => true,
            'synced' => true,
            'account_id' => $account_id,
            'terminal_id' => $terminal_id,
            'server_time' => $server_time,
        ));
    }

    public function post_ea_signal_candidates(WP_REST_Request $request) {
        global $wpdb;

        $payload = $request->get_json_params();
        if (!is_array($payload) || !isset($payload['candidates']) || !is_array($payload['candidates'])) {
            return new \WP_Error('invalid_payload', 'candidates array required', array('status' => 400));
        }

        $user_id = get_current_user_id();
        $table = $wpdb->prefix . 'smc_sf_mt5_signal_candidates';
        $valid_directions = array('LONG', 'SHORT');
        $valid_status = array('WATCH', 'ARMED', 'READY');
        $valid_verdicts = array('A+', 'A', 'B', 'C');
        $written = 0;
        $suppressed = 0;
        $failed = 0;

        foreach ($payload['candidates'] as $cand) {
            if (!is_array($cand) || empty($cand['id']) || empty($cand['symbol'])) {
                $failed++;
                continue;
            }

            $id = sanitize_text_field((string) $cand['id']);
            $stored_id = substr($id, 0, 64);
            $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper(sanitize_text_field((string) $cand['symbol'])));
            $direction = strtoupper(sanitize_text_field((string) ($cand['direction'] ?? 'LONG')));
            $status = strtoupper(sanitize_text_field((string) ($cand['status'] ?? 'WATCH')));
            $verdict = strtoupper(sanitize_text_field((string) ($cand['verdict'] ?? 'C')));

            if (!in_array($direction, $valid_directions, true) ||
                !in_array($status, $valid_status, true) ||
                !in_array($verdict, $valid_verdicts, true)) {
                $failed++;
                continue;
            }

            $entry_price = isset($cand['entry_price']) && is_numeric($cand['entry_price']) ? (float) $cand['entry_price'] : 0.0;
            $sl_price = isset($cand['sl_price']) && is_numeric($cand['sl_price']) ? (float) $cand['sl_price'] : null;
            $tp_price = isset($cand['tp_price']) && is_numeric($cand['tp_price']) ? (float) $cand['tp_price'] : null;
            $fib_level = isset($cand['fib_level']) && is_numeric($cand['fib_level']) ? (float) $cand['fib_level'] : null;
            $fib_ratio = isset($cand['fib_ratio']) && is_numeric($cand['fib_ratio']) ? (float) $cand['fib_ratio'] : null;
            $fib_family = sanitize_text_field((string) ($cand['fib_family'] ?? ''));
            $htf_bias = sanitize_text_field((string) ($cand['htf_bias'] ?? ''));
            $ltf_regime = sanitize_text_field((string) ($cand['ltf_regime'] ?? ''));
            $confidence = max(0.0, min(1.0, (float) ($cand['confidence'] ?? 0.0)));
            $created_at = $this->legacy->normalize_market_timestamp($cand['created_at'] ?? null, $this->legacy->now_mysql());
            $drift_pips = null;

            $prior_candidate = $this->legacy->find_latest_mt5_candidate_for_range(
                $user_id,
                $symbol,
                $direction,
                $fib_family,
                $fib_ratio,
                $fib_level
            );

            if (is_array($prior_candidate)) {
                $lifecycle = $this->legacy->get_mt5_candidate_lifecycle_state($user_id, $symbol, $direction, $prior_candidate);
                $lifecycle_state = (string) ($lifecycle['state'] ?? 'LIFECYCLE_UNRESOLVED');
                $lifecycle_reason = (string) ($lifecycle['reason'] ?? '');
                $diagnostic = array(
                    'prior_candidate_id' => (string) ($prior_candidate['id'] ?? ''),
                    'incoming_candidate_id' => $stored_id,
                    'symbol' => $symbol,
                    'direction' => $direction,
                    'suppression_basis' => $lifecycle_state,
                    'reason' => $lifecycle_reason,
                );
                if (!empty($lifecycle['matched_id'])) {
                    $diagnostic['matched_id'] = (string) ($lifecycle['matched_id'] ?? '');
                }

                if (in_array($lifecycle_state, array('ACTIVE_OPEN_POSITION', 'ACTIVE_PENDING_ORDER', 'ACTIVE_PRE_ENTRY'), true)) {
                    $this->legacy->audit($user_id, 'ea.signal_candidate_suppressed', $diagnostic);
                    error_log(sprintf(
                        '[SMC_SF] ea/signal-candidates suppressed prior=%s incoming=%s symbol=%s direction=%s basis=%s reason=%s',
                        $diagnostic['prior_candidate_id'],
                        $stored_id,
                        $symbol,
                        $direction,
                        $lifecycle_state,
                        $lifecycle_reason
                    ));
                    $suppressed++;
                    continue;
                }

                if ($lifecycle_state === 'INACTIVE_DIRECTION_FLIP_UNCONFIRMED') {
                    $this->legacy->audit($user_id, 'ea.signal_candidate_suppressed', $diagnostic);
                    error_log(sprintf(
                        '[SMC_SF] ea/signal-candidates direction-flip suppressed prior=%s incoming=%s symbol=%s direction=%s basis=%s reason=%s',
                        $diagnostic['prior_candidate_id'],
                        $stored_id,
                        $symbol,
                        $direction,
                        $lifecycle_state,
                        $lifecycle_reason
                    ));
                    $suppressed++;
                    continue;
                }

                if ($lifecycle_state === 'LIFECYCLE_UNRESOLVED') {
                    $this->legacy->audit($user_id, 'ea.signal_candidate_lifecycle_unresolved', $diagnostic);
                    error_log(sprintf(
                        '[SMC_SF] ea/signal-candidates unresolved prior=%s incoming=%s symbol=%s direction=%s reason=%s',
                        $diagnostic['prior_candidate_id'],
                        $stored_id,
                        $symbol,
                        $direction,
                        $lifecycle_reason
                    ));
                }
            }

            $pine_match = $this->legacy->classify_signal_drift($user_id, $symbol, $direction, $entry_price, $drift_pips);

            $result = $wpdb->replace(
                $table,
                array(
                    'id' => $stored_id,
                    'user_id' => $user_id,
                    'symbol' => $symbol,
                    'direction' => $direction,
                    'status' => $status,
                    'verdict' => $verdict,
                    'entry_price' => $entry_price,
                    'sl_price' => $sl_price,
                    'tp_price' => $tp_price,
                    'fib_level' => $fib_level,
                    'fib_ratio' => $fib_ratio,
                    'fib_family' => $fib_family,
                    'htf_bias' => $htf_bias,
                    'ltf_regime' => $ltf_regime,
                    'confidence' => $confidence,
                    'pine_match' => $pine_match,
                    'drift_pips' => $drift_pips,
                    'source' => 'mt5',
                    'created_at' => $created_at,
                ),
                array('%s', '%d', '%s', '%s', '%s', '%s', '%f',
                      $sl_price !== null ? '%f' : 'NULL',
                      $tp_price !== null ? '%f' : 'NULL',
                      $fib_level !== null ? '%f' : 'NULL',
                      $fib_ratio !== null ? '%f' : 'NULL',
                      '%s', '%s', '%s', '%f', '%s',
                      $drift_pips !== null ? '%f' : 'NULL',
                      '%s', '%s')
            );

            if ($result !== false) {
                $written++;
            } else {
                $failed++;
            }
        }

        error_log(sprintf('[SMC_SF] ea/signal-candidates written=%d suppressed=%d failed=%d user_id=%d', $written, $suppressed, $failed, $user_id));

        return rest_ensure_response(array(
            'ok' => $failed === 0,
            'written' => $written,
            'failed' => $failed,
        ));
    }

    public function get_ea_execution_queue(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();

        if (!$this->legacy->is_phase6_gate_cleared($user_id)) {
            return rest_ensure_response(array(
                'ok' => true,
                'gated' => true,
                'reason' => 'Phase 6 parity gate not yet cleared (target: 95%)',
                'requests' => array(),
            ));
        }

        $table = $wpdb->prefix . 'smc_sf_execution_audit';
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT id, signal_id, symbol, direction, order_type, lots, entry_price, sl_price, tp_price
             FROM {$table} WHERE user_id = %d AND status = 'PENDING' AND risk_check_passed = 1
             ORDER BY requested_at ASC LIMIT 10",
            $user_id
        ), ARRAY_A);

        $requests = array();
        foreach ((array) $rows as $row) {
            $requests[] = array(
                'requestId' => (int) $row['id'],
                'signalId' => $row['signal_id'],
                'symbol' => $row['symbol'],
                'direction' => $row['direction'],
                'orderType' => $row['order_type'],
                'lots' => (float) $row['lots'],
                'entryPrice' => $row['entry_price'] !== null ? (float) $row['entry_price'] : null,
                'slPrice' => $row['sl_price'] !== null ? (float) $row['sl_price'] : null,
                'tpPrice' => $row['tp_price'] !== null ? (float) $row['tp_price'] : null,
            );
        }

        return rest_ensure_response(array(
            'ok' => true,
            'gated' => false,
            'requests' => $requests,
        ));
    }

    public function post_ea_execution_ack(WP_REST_Request $request) {
        global $wpdb;

        $payload = $request->get_json_params();
        if (!is_array($payload) || !isset($payload['request_id'])) {
            return new \WP_Error('invalid_payload', 'request_id required', array('status' => 400));
        }

        $user_id = get_current_user_id();
        $request_id = (int) $payload['request_id'];
        $status = sanitize_text_field(strtoupper((string) ($payload['status'] ?? 'REJECTED')));
        $mt5_ticket = isset($payload['mt5_ticket']) ? (int) $payload['mt5_ticket'] : null;
        $exec_price = isset($payload['executed_price']) && is_numeric($payload['executed_price']) ? (float) $payload['executed_price'] : null;
        $exec_lots = isset($payload['executed_lots']) && is_numeric($payload['executed_lots']) ? (float) $payload['executed_lots'] : null;
        $reject_rsn = sanitize_text_field((string) ($payload['reject_reason'] ?? ''));
        $ack_at = $this->legacy->now_mysql();

        $table = $wpdb->prefix . 'smc_sf_execution_audit';

        $updated = $wpdb->update(
            $table,
            array(
                'status' => $status,
                'mt5_ticket' => $mt5_ticket,
                'executed_at' => ($status === 'FILLED') ? $ack_at : null,
                'ack_at' => $ack_at,
                'reject_reason' => $reject_rsn !== '' ? $reject_rsn : null,
            ),
            array('id' => $request_id, 'user_id' => $user_id),
            array('%s', $mt5_ticket !== null ? '%d' : 'NULL', '%s', '%s', '%s'),
            array('%d', '%d')
        );

        error_log(sprintf('[SMC_SF] ea/execution-ack request_id=%d status=%s mt5_ticket=%s user_id=%d',
            $request_id, $status, (string) $mt5_ticket, $user_id));

        return rest_ensure_response(array(
            'ok' => $updated !== false,
            'updated' => (int) $updated,
        ));
    }

    public function post_ea_symbol_sync(WP_REST_Request $request) {
        global $wpdb;

        if (!$this->legacy::ensure_bridge_tables()) {
            $detail = $this->legacy->wpdb_last_error();
            error_log('SMC SuperFIB EA symbol sync failed: symbol_sync table init error ' . ($detail !== null ? $detail : 'dbDelta unavailable'));
            return new \WP_Error('smc_sf_symbol_sync_table_init_failed', 'Could not initialize symbol sync storage.', array('status' => 500));
        }

        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $user_id = get_current_user_id();
        $server_time = gmdate('c');
        $seen_at = $this->legacy->normalize_market_timestamp($this->legacy->ea_request_value($request, $payload, 'timestamp', $server_time), $this->legacy->now_mysql());
        $symbols = $this->legacy->normalize_symbol_sync_payload($request, $payload);
        if (empty($symbols)) {
            return new \WP_Error('smc_sf_symbol_sync_symbols_required', 'symbols payload is required.', array('status' => 400));
        }

        $upserted = 0;
        foreach ($symbols as $symbol_payload) {
            $record = $this->legacy->build_symbol_sync_record($request, $payload, $symbol_payload, $user_id, $seen_at);
            if (is_wp_error($record)) {
                return $record;
            }

            $saved = $wpdb->replace(
                $this->legacy->table('symbol_sync'),
                $record,
                array('%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%f', '%f', '%s', '%f', '%f', '%f', '%f', '%s', '%s', '%s', '%s', '%s', '%s')
            );

            if ($saved === false) {
                error_log(sprintf(
                    'SMC SuperFIB EA symbol sync failed: user_id=%d broker_symbol=%s wpdb_error=%s',
                    $user_id,
                    $record['broker_symbol'],
                    $this->legacy->wpdb_last_error() ?: 'unknown'
                ));
                return new \WP_Error('smc_sf_symbol_sync_write_failed', 'Could not persist symbol sync payload.', array('status' => 500));
            }

            $upserted++;
        }

        error_log(sprintf(
            'SMC SuperFIB EA symbol sync saved: user_id=%d received=%d upserted=%d',
            $user_id,
            count($symbols),
            $upserted
        ));

        return rest_ensure_response(array(
            'ok' => true,
            'synced' => true,
            'symbols_received' => count($symbols),
            'symbols_upserted' => $upserted,
            'server_time' => $server_time,
        ));
    }

    public function get_ea_license_check(WP_REST_Request $request) {
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $user_id = get_current_user_id();
        $server_time = gmdate('c');
        $account_id = $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'account_id', ''), 64);
        $terminal_id = $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'terminal_id', ''), 96);
        $ea_version = $this->legacy->sanitize_ea_text($this->legacy->ea_request_value($request, $payload, 'ea_version', ''), 64);
        $blob = $this->legacy->get_account_blob($user_id);
        $license = $this->legacy->resolve_ea_license_status($blob, $account_id, $terminal_id);

        if (!$license['allowed']) {
            error_log(sprintf(
                'SMC SuperFIB EA license blocked: user_id=%d account_id=%s terminal_id=%s reason=%s',
                $user_id,
                $account_id !== '' ? $account_id : 'unknown',
                $terminal_id !== '' ? $terminal_id : 'unknown',
                $license['reason'] !== null ? $license['reason'] : 'unspecified'
            ));

            return rest_ensure_response(array(
                'ok' => true,
                'allowed' => false,
                'status' => $license['status'],
                'reason' => $license['reason'],
                'server_time' => $server_time,
            ));
        }

        error_log(sprintf(
            'SMC SuperFIB EA license allowed: user_id=%d account_id=%s terminal_id=%s ea_version=%s',
            $user_id,
            $account_id !== '' ? $account_id : 'unknown',
            $terminal_id !== '' ? $terminal_id : 'unknown',
            $ea_version !== '' ? $ea_version : 'unknown'
        ));

        return rest_ensure_response(array(
            'ok' => true,
            'allowed' => true,
            'status' => $license['status'],
            'user_id' => $user_id,
            'account_id' => $account_id,
            'terminal_id' => $terminal_id,
            'plan' => $license['plan'],
            'reason' => null,
            'server_time' => $server_time,
        ));
    }
}
