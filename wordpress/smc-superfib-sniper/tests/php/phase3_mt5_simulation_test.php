<?php

require_once __DIR__ . '/test-ea-bridge-bootstrap.php';

function phase3_base_payload() {
    $now = time();

    return array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'normalized_symbol' => 'EURUSD',
        'timeframe' => 'M1',
        'timestamp' => gmdate('c', $now - 5),
        'bid' => 1.08450,
        'ask' => 1.08470,
        'spread' => 0.00020,
        'freshness' => 'LIVE',
        'session' => 'London',
        'candle' => array(
            'time' => gmdate('c', $now - 60),
            'open' => 1.08400,
            'high' => 1.08500,
            'low' => 1.08350,
            'close' => 1.08450,
            'volume' => 5000,
        ),
        'candle_m15' => array(
            'time' => gmdate('c', $now - 900),
            'open' => 1.08200,
            'high' => 1.08600,
            'low' => 1.08150,
            'close' => 1.08450,
            'volume' => 15000,
        ),
    );
}

function phase3_dispatch($plugin, array $payload) {
    return dispatch_ea_request(
        $plugin,
        'permission_ea_market_stream',
        'post_ea_market_stream',
        $payload,
        ea_bridge_headers()
    );
}

function phase3_snapshot_rows($user_id, $symbol) {
    global $wpdb;

    $rows = array();
    foreach ($wpdb->tables['wp_smc_sf_snapshots'] ?? array() as $row) {
        if ((int) ($row['user_id'] ?? 0) === $user_id
            && ($row['symbol'] ?? '') === $symbol
            && ($row['source'] ?? '') === 'mt5') {
            $rows[] = $row;
        }
    }

    return $rows;
}

function phase3_candle_rows($user_id, $symbol, $timeframe = null, $candle_time = null) {
    global $wpdb;

    $rows = array();
    foreach ($wpdb->tables['wp_smc_sf_candles'] ?? array() as $row) {
        if ((int) ($row['user_id'] ?? 0) !== $user_id) {
            continue;
        }
        if (($row['symbol'] ?? '') !== $symbol || ($row['source'] ?? '') !== 'mt5') {
            continue;
        }
        if ($timeframe !== null && ($row['timeframe'] ?? '') !== $timeframe) {
            continue;
        }
        if ($candle_time !== null && ($row['candle_time'] ?? '') !== $candle_time) {
            continue;
        }
        $rows[] = $row;
    }

    return $rows;
}

function phase3_assert_wp_error($response, $code, $status, $message) {
    assert_true(is_wp_error($response), $message . ' must return WP_Error');
    assert_same($code, $response->code, $message . ' must return expected error code');
    assert_same($status, (int) ($response->data['status'] ?? 0), $message . ' must return expected HTTP status');
}

reset_ea_bridge_test_state();
$plugin = new SMC_SuperFib_Sniper_REST();

// 1. Full Phase 3 payload ingestion.
$payload = phase3_base_payload();
$response = phase3_dispatch($plugin, $payload);
assert_true($response instanceof WP_REST_Response, 'Full Phase 3 payload must return a REST response');
assert_true(!empty($response->data['ok']), 'Full Phase 3 payload must succeed');
assert_same(1, (int) $response->data['snapshots_inserted'], 'Full Phase 3 payload must insert one snapshot row');
assert_same(2, (int) $response->data['candles_inserted'], 'Full Phase 3 payload must insert one M1 and one M15 candle row');
$snapshot_rows = phase3_snapshot_rows(7, 'EURUSD');
assert_same(1, count($snapshot_rows), 'Full Phase 3 payload must persist exactly one MT5 snapshot row');
$m1_time = gmdate('Y-m-d H:i:s', strtotime($payload['candle']['time']));
$m15_time = gmdate('Y-m-d H:i:s', strtotime($payload['candle_m15']['time']));
assert_same(1, count(phase3_candle_rows(7, 'EURUSD', '1min', $m1_time)), 'Full Phase 3 payload must persist exactly one MT5 M1 candle row');
assert_same(1, count(phase3_candle_rows(7, 'EURUSD', '15min', $m15_time)), 'Full Phase 3 payload must persist exactly one MT5 M15 candle row');
assert_same('LIVE', $GLOBALS['test_transients']['smc_sf_freshness_7_EURUSD'] ?? null, 'Full Phase 3 payload must store MT5 freshness');
assert_same('London', $GLOBALS['test_transients']['smc_sf_session_7_EURUSD'] ?? null, 'Full Phase 3 payload must store MT5 session');

// 2. Missing freshness.
reset_ea_bridge_test_state();
$plugin = new SMC_SuperFib_Sniper_REST();
$payload = phase3_base_payload();
unset($payload['freshness']);
$response = phase3_dispatch($plugin, $payload);
phase3_assert_wp_error($response, 'invalid_phase3_payload', 400, 'Missing freshness');

// 3. Missing session.
reset_ea_bridge_test_state();
$plugin = new SMC_SuperFib_Sniper_REST();
$payload = phase3_base_payload();
unset($payload['session']);
$response = phase3_dispatch($plugin, $payload);
phase3_assert_wp_error($response, 'invalid_phase3_payload', 400, 'Missing session');

// 4. Missing OHLC field.
reset_ea_bridge_test_state();
$plugin = new SMC_SuperFib_Sniper_REST();
$payload = phase3_base_payload();
unset($payload['candle']['close']);
$response = phase3_dispatch($plugin, $payload);
phase3_assert_wp_error($response, 'invalid_phase3_payload', 400, 'Missing OHLC field');

// 5. Stale payload (>300 seconds old).
reset_ea_bridge_test_state();
$plugin = new SMC_SuperFib_Sniper_REST();
$payload = phase3_base_payload();
$payload['timestamp'] = gmdate('c', time() - 400);
$response = phase3_dispatch($plugin, $payload);
phase3_assert_wp_error($response, 'stale_data', 422, 'Stale Phase 3 payload');

// 6. CLOSED freshness state persists without stale rejection.
reset_ea_bridge_test_state();
$plugin = new SMC_SuperFib_Sniper_REST();
$payload = phase3_base_payload();
$payload['freshness'] = 'CLOSED';
$payload['session'] = 'Closed';
$payload['timestamp'] = gmdate('c', time());
$response = phase3_dispatch($plugin, $payload);
assert_true($response instanceof WP_REST_Response, 'CLOSED freshness payload must return a REST response');
assert_true(!empty($response->data['ok']), 'CLOSED freshness payload must succeed');
$snapshot_rows = phase3_snapshot_rows(7, 'EURUSD');
assert_same(1, count($snapshot_rows), 'CLOSED freshness payload must still persist the MT5 snapshot row');
assert_same('offline', $snapshot_rows[0]['state'] ?? null, 'CLOSED freshness payload must persist an offline snapshot state');
assert_same('CLOSED', $GLOBALS['test_transients']['smc_sf_freshness_7_EURUSD'] ?? null, 'CLOSED freshness payload must store CLOSED freshness');

// 7. get_price_snapshot must reinterpret stale CLOSED state as stale once broker time shows Monday open.
reset_ea_bridge_test_state();
$service = new SMC_MarketData_Service();
assert_true(
    $service->store_tick_snapshot(7, 'EURUSD', array(
        'bid' => 1.08450,
        'ask' => 1.08470,
        'spread' => 2,
        'timestamp' => '2026-05-24T20:59:00Z',
        'freshness' => 'CLOSED',
    )),
    'Market data service must store a pre-open CLOSED EURUSD snapshot'
);
set_transient('smc_sf_freshness_7_EURUSD', 'CLOSED', 300);
set_transient('smc_sf_session_7_EURUSD', 'Closed', 300);
assert_true(
    $service->store_tick_snapshot(7, 'BTCUSD', array(
        'bid' => 103250.10,
        'ask' => 103250.90,
        'spread' => 80,
        'timestamp' => '2026-05-25T00:05:00Z',
        'freshness' => 'LIVE',
    )),
    'Market data service must store a Monday-open broker reference snapshot'
);
$reopenedSnapshot = $service->get_price_snapshot(7, 'EURUSD');
assert_true(is_array($reopenedSnapshot), 'Market data service must return the CLOSED EURUSD snapshot after service-level setup');
assert_same('CLOSED', $reopenedSnapshot['freshness'] ?? null, 'Market data service must preserve CLOSED freshness on the stale override path');
assert_same('stale', $reopenedSnapshot['state'] ?? null, 'Market data service must reinterpret stale CLOSED snapshots as stale after market reopen');

// 8. DISCONNECTED freshness must remain offline even after a Monday-open reference tick arrives.
reset_ea_bridge_test_state();
$service = new SMC_MarketData_Service();
assert_true(
    $service->store_tick_snapshot(7, 'EURUSD', array(
        'bid' => 1.08450,
        'ask' => 1.08470,
        'spread' => 2,
        'timestamp' => '2026-05-24T20:59:00Z',
        'freshness' => 'DISCONNECTED',
    )),
    'Market data service must store a DISCONNECTED EURUSD snapshot'
);
set_transient('smc_sf_freshness_7_EURUSD', 'DISCONNECTED', 300);
set_transient('smc_sf_session_7_EURUSD', 'Closed', 300);
assert_true(
    $service->store_tick_snapshot(7, 'BTCUSD', array(
        'bid' => 103250.10,
        'ask' => 103250.90,
        'spread' => 80,
        'timestamp' => '2026-05-25T00:05:00Z',
        'freshness' => 'LIVE',
    )),
    'Market data service must store a Monday-open broker reference snapshot for the DISCONNECTED path'
);
$disconnectedSnapshot = $service->get_price_snapshot(7, 'EURUSD');
assert_true(is_array($disconnectedSnapshot), 'Market data service must return the DISCONNECTED EURUSD snapshot after service-level setup');
assert_same('DISCONNECTED', $disconnectedSnapshot['freshness'] ?? null, 'Market data service must preserve DISCONNECTED freshness');
assert_same('offline', $disconnectedSnapshot['state'] ?? null, 'Market data service must keep DISCONNECTED snapshots offline after market reopen');

// 9. Duplicate candle upsert.
reset_ea_bridge_test_state();
$plugin = new SMC_SuperFib_Sniper_REST();
$payload = phase3_base_payload();
$duplicate_m1_time = gmdate('Y-m-d H:i:s', strtotime($payload['candle']['time']));
$duplicate_m15_time = gmdate('Y-m-d H:i:s', strtotime($payload['candle_m15']['time']));
$response = phase3_dispatch($plugin, $payload);
assert_true($response instanceof WP_REST_Response && !empty($response->data['ok']), 'Initial duplicate test payload must succeed');
$response = phase3_dispatch($plugin, $payload);
assert_true($response instanceof WP_REST_Response && !empty($response->data['ok']), 'Repeated duplicate test payload must succeed');
assert_same(1, count(phase3_candle_rows(7, 'EURUSD', '1min', $duplicate_m1_time)), 'Duplicate Phase 3 M1 candle payloads must upsert to one row');
assert_same(1, count(phase3_candle_rows(7, 'EURUSD', '15min', $duplicate_m15_time)), 'Duplicate Phase 3 M15 candle payloads must upsert to one row');

// 10. Legacy M15-only payload remains accepted.
reset_ea_bridge_test_state();
$plugin = new SMC_SuperFib_Sniper_REST();
$payload = phase3_base_payload();
unset($payload['candle']);
$response = phase3_dispatch($plugin, $payload);
assert_true($response instanceof WP_REST_Response, 'M15-only payload must return a REST response');
assert_true(!empty($response->data['ok']), 'M15-only payload must succeed');
assert_same(1, (int) $response->data['snapshots_inserted'], 'M15-only payload must still insert one snapshot row');
assert_same(1, (int) $response->data['candles_inserted'], 'M15-only payload must insert only one M15 candle row');
$m15_only_time = gmdate('Y-m-d H:i:s', strtotime($payload['candle_m15']['time']));
assert_same(0, count(phase3_candle_rows(7, 'EURUSD', '1min')), 'M15-only payload must not require or insert an M1 candle row');
assert_same(1, count(phase3_candle_rows(7, 'EURUSD', '15min', $m15_only_time)), 'M15-only payload must persist exactly one MT5 M15 candle row');

// 11. Explicit null M1 candle must be treated as present and rejected.
reset_ea_bridge_test_state();
$plugin = new SMC_SuperFib_Sniper_REST();
$payload = phase3_base_payload();
$payload['candle'] = null;
$response = phase3_dispatch($plugin, $payload);
phase3_assert_wp_error($response, 'invalid_phase3_payload', 400, 'Null explicit M1 candle');

fwrite(STDOUT, "phase3 mt5 simulation checks passed\n");
