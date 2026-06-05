<?php

require_once __DIR__ . '/fib-test-helpers.php';

fib_test_reset_env(11);

$registrar = new SMC_SuperFib_Route_Registrar();
$ref = new ReflectionMethod('SMC_SuperFib_Route_Registrar', 'route_definitions');
$ref->setAccessible(true);
$routes = $ref->invoke($registrar);

$found = false;
foreach ($routes as $route) {
    if (($route['path'] ?? '') === '/market-data/candles') {
        $found = true;
        fib_test_assert_same(WP_REST_Server::READABLE, $route['methods'], 'Phase 4 candle export route must be readable');
        fib_test_assert_same('get_market_data_candles', $route['callback'], 'Phase 4 candle export route must use the candle callback');
        fib_test_assert_same('user', $route['permission'] ?? 'user', 'Phase 4 candle export route must require normal WordPress auth');
    }
}
fib_test_assert_true($found, 'Route registrar must expose /market-data/candles');

$rest = fib_test_make_rest_instance();
fib_test_assert_true(method_exists($rest, 'get_market_data_candles'), 'REST plugin must implement get_market_data_candles');

function phase4_seed_m1_candle($user_id, $symbol, $time, $open, $high, $low, $close, $volume = 1) {
    global $wpdb;

    $wpdb->insert(fib_test_table_name('candles'), array(
        'user_id' => (int) $user_id,
        'symbol' => $symbol,
        'timeframe' => '1min',
        'candle_time' => gmdate('Y-m-d H:i:s', strtotime($time . ' UTC')),
        'open' => (float) $open,
        'high' => (float) $high,
        'low' => (float) $low,
        'close' => (float) $close,
        'volume' => (int) $volume,
        'source' => 'mt5',
    ));
}

function phase4_seed_direct_candle($user_id, $symbol, $timeframe, $time, $open, $high, $low, $close, $volume = 1) {
    global $wpdb;

    $wpdb->insert(fib_test_table_name('candles'), array(
        'user_id' => (int) $user_id,
        'symbol' => $symbol,
        'timeframe' => $timeframe,
        'candle_time' => gmdate('Y-m-d H:i:s', strtotime($time . ' UTC')),
        'open' => (float) $open,
        'high' => (float) $high,
        'low' => (float) $low,
        'close' => (float) $close,
        'volume' => (int) $volume,
        'source' => 'mt5',
    ));
}

function phase4_seed_m1_range($user_id, $symbol, $bucket_start, $minutes) {
    $start_ts = strtotime($bucket_start . ' UTC');
    for ($minute = 0; $minute < $minutes; $minute++) {
        $time = gmdate('Y-m-d H:i:s', $start_ts + ($minute * 60));
        phase4_seed_m1_candle(
            $user_id,
            $symbol,
            $time,
            1000 + $minute,
            2000 + $minute,
            500 - $minute,
            3000 + $minute,
            1
        );
    }
}

fib_test_reset_env(11);
phase4_seed_m1_range(11, 'EURUSD', '2026-01-01 00:00:00', 60);
phase4_seed_m1_range(11, 'EURUSD', '2026-01-01 01:00:00', 60);
phase4_seed_m1_range(11, 'EURUSD', '2026-01-01 02:00:00', 30);

$service = new SMC_MarketData_Service();
$candles = $service->get_phase4_candles(11, 'EURUSD', 'H1', 2);

fib_test_assert_same(2, count($candles), 'M1 fallback must over-fetch enough rows to return two complete H1 candles after dropping a partial newest bucket');
fib_test_assert_same('2026-01-01T00:00:00Z', $candles[0]['time'], 'M1 fallback must keep the complete oldest H1 bucket instead of exporting a truncated bucket');
fib_test_assert_same('2026-01-01T01:00:00Z', $candles[1]['time'], 'M1 fallback must return the newest complete H1 bucket');
fib_test_assert_near(1000, $candles[0]['open'], 0.000001, 'Complete H1 open must come from the first M1 row');
fib_test_assert_near(2059, $candles[0]['high'], 0.000001, 'Complete H1 high must include all 60 M1 rows');
fib_test_assert_near(441, $candles[0]['low'], 0.000001, 'Complete H1 low must include all 60 M1 rows');
fib_test_assert_near(3059, $candles[0]['close'], 0.000001, 'Complete H1 close must come from the last M1 row');
fib_test_assert_same(60, $candles[0]['volume'], 'Complete H1 volume must include all 60 M1 rows');

fib_test_reset_env(11);
phase4_seed_m1_range(11, 'EURUSD', '2026-01-01 00:30:00', 30);
phase4_seed_m1_range(11, 'EURUSD', '2026-01-01 01:00:00', 60);

$service = new SMC_MarketData_Service();
$candles = $service->get_phase4_candles(11, 'EURUSD', 'H1', 2);

fib_test_assert_same(1, count($candles), 'M1 fallback must drop oldest buckets that do not have full minute coverage');
fib_test_assert_same('2026-01-01T01:00:00Z', $candles[0]['time'], 'M1 fallback must only export fully covered H1 buckets');

fib_test_reset_env(11);
$start_ts = strtotime('2026-01-01 00:00:00 UTC');
for ($i = 0; $i < 2001; $i++) {
    phase4_seed_direct_candle(
        11,
        'EURUSD',
        '1h',
        gmdate('Y-m-d H:i:s', $start_ts + ($i * 3600)),
        1.1,
        1.2,
        1.0,
        1.15,
        1
    );
}

$service = new SMC_MarketData_Service();
$candles = $service->get_phase4_candles(11, 'EURUSD', 'H1', 60000);

fib_test_assert_same(2000, count($candles), 'H1 output candle requests must keep the old 2000 cap even when M15 allows 60000 for parity exports');

fib_test_reset_env(11);
$start_ts = strtotime('2026-01-01 00:00:00 UTC');
for ($i = 0; $i < 2001; $i++) {
    phase4_seed_direct_candle(
        11,
        'EURUSD',
        '15min',
        gmdate('Y-m-d H:i:s', $start_ts + ($i * 900)),
        1.1,
        1.2,
        1.0,
        1.15,
        1
    );
}

$service = new SMC_MarketData_Service();
$candles = $service->get_phase4_candles(11, 'EURUSD', 'M15', 60000);

fib_test_assert_same(2001, count($candles), 'M15 parity exports must keep the raised cap and return more than 2000 direct MT5 candles when available');

fwrite(STDOUT, 'phase4 candle export route contract passed' . PHP_EOL);
