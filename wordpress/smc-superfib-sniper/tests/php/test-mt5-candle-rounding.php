<?php

require_once __DIR__ . '/test-ea-bridge-bootstrap.php';

reset_ea_bridge_test_state();

global $wpdb;

$plugin = new SMC_SuperFib_Sniper_REST();
$candle_ts = strtotime(gmdate('Y-m-d H:i:58', time() - 180));
$stream_ts = $candle_ts + 90;

$payload = array(
    'user_id' => 7,
    'symbol' => 'EURUSD',
    'timeframe' => 'M1',
    'source' => 'MT5',
    'quote_time' => gmdate('c', $stream_ts),
    'bid' => 1.08521,
    'ask' => 1.08534,
    'spread' => 1.3,
    'freshness' => 'LIVE',
    'session' => 'London',
    'candle' => array(
        'time' => gmdate('c', $candle_ts),
        'open' => 1.08500,
        'high' => 1.08550,
        'low' => 1.08480,
        'close' => 1.08520,
        'volume' => 120,
    ),
    'candle_m15' => array(
        'time' => gmdate('c', $candle_ts),
        'open' => 1.08500,
        'high' => 1.08550,
        'low' => 1.08480,
        'close' => 1.08520,
        'volume' => 120,
    ),
);

$response = dispatch_ea_request(
    $plugin,
    'permission_ea_market_stream',
    'post_ea_market_stream',
    $payload,
    ea_bridge_headers()
);

assert_true($response instanceof WP_REST_Response, 'EA market stream must accept the rounding regression payload');
assert_same(2, (int) ($response->data['candles_inserted'] ?? 0), 'EA market stream must persist both M1 and M15 candles');

$m1_candle_time = null;
$m15_candle_time = null;
foreach (($wpdb->tables[$wpdb->prefix . 'smc_sf_candles'] ?? array()) as $row) {
    if (($row['symbol'] ?? null) !== 'EURUSD') {
        continue;
    }
    if (($row['timeframe'] ?? null) === '1min') {
        $m1_candle_time = $row['candle_time'] ?? null;
    }
    if (($row['timeframe'] ?? null) === '15min') {
        $m15_candle_time = $row['candle_time'] ?? null;
    }
}

assert_same(gmdate('Y-m-d H:i:58', $candle_ts), $m1_candle_time, 'M1 candle time must stay unrounded');
assert_same(gmdate('Y-m-d H:i:00', (int) (round($candle_ts / 60) * 60)), $m15_candle_time, 'M15 candle time must round broker jitter to the nearest minute');

echo "MT5 candle rounding checks passed\n";
