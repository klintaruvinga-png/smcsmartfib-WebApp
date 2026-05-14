<?php

require_once __DIR__ . '/fib-test-helpers.php';

$instance = fib_test_make_rest_instance();
$ratios = array(-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300);

$dataset15m = array(
    fib_test_make_candle('2026-04-06 12:00:00 UTC', 10, 1),
    fib_test_make_candle('2026-04-13 12:00:00 UTC', 20, 2),
    fib_test_make_candle('2026-04-20 12:00:00 UTC', 30, 3),
    fib_test_make_candle('2026-04-27 12:00:00 UTC', 40, 4),
    fib_test_make_candle('2026-05-05 12:00:00 UTC', 50, 5),
    fib_test_make_candle('2026-05-06 12:00:00 UTC', 60, 6),
    fib_test_make_candle('2026-05-07 12:00:00 UTC', 70, 7),
    fib_test_make_candle('2026-05-08 12:00:00 UTC', 80, 8),
);
$dataset1h = array(
    fib_test_make_candle('2026-01-06 12:00:00 UTC', 10, 1),
    fib_test_make_candle('2026-02-03 12:00:00 UTC', 20, 2),
    fib_test_make_candle('2026-03-03 12:00:00 UTC', 30, 3),
    fib_test_make_candle('2026-04-07 12:00:00 UTC', 40, 4),
    fib_test_make_candle('2026-04-14 12:00:00 UTC', 50, 5),
    fib_test_make_candle('2026-04-21 12:00:00 UTC', 60, 6),
    fib_test_make_candle('2026-04-28 12:00:00 UTC', 70, 7),
    fib_test_make_candle('2026-05-05 12:00:00 UTC', 80, 8),
);
$dataset1d = array(
    fib_test_make_candle('2021-10-15 12:00:00 UTC', 20, 2),
    fib_test_make_candle('2022-10-15 12:00:00 UTC', 30, 3),
    fib_test_make_candle('2023-10-15 12:00:00 UTC', 40, 4),
    fib_test_make_candle('2024-04-15 12:00:00 UTC', 50, 5),
    fib_test_make_candle('2024-07-15 12:00:00 UTC', 60, 6),
    fib_test_make_candle('2024-10-15 12:00:00 UTC', 70, 7),
    fib_test_make_candle('2025-01-15 12:00:00 UTC', 80, 8),
);

$expectedLtf = fib_test_expected_prices(61.5, 6.15, $ratios);
$expectedHtf15m = fib_test_expected_prices(20.0, 2.0, $ratios);
$expectedHtf1h = fib_test_expected_prices(20.0, 2.0, $ratios);
$expectedHtf1d = fib_test_expected_prices(30.0, 3.0, $ratios);

$cases = array();
foreach (array('EURUSD', 'USDJPY', 'XAUUSD') as $symbol) {
    $cases[] = array('symbol' => $symbol, 'timeframe' => '15min', 'seconds' => 900, 'candles' => $dataset15m, 'expected_htf' => $expectedHtf15m);
    $cases[] = array('symbol' => $symbol, 'timeframe' => '1h', 'seconds' => 3600, 'candles' => $dataset1h, 'expected_htf' => $expectedHtf1h);
    $cases[] = array('symbol' => $symbol, 'timeframe' => '1day', 'seconds' => 86400, 'candles' => $dataset1d, 'expected_htf' => $expectedHtf1d);
}

foreach ($cases as $case) {
    fib_test_set_private_property($instance, 'fib_context_symbol', $case['symbol']);
    fib_test_set_private_property($instance, 'fib_context_timeframe', $case['timeframe']);
    fib_test_set_private_property($instance, 'fib_context_tf_seconds', $case['seconds']);
    $result = fib_test_invoke_private_method($instance, 'fib_levels_from_candles', array($case['candles']));

    fib_test_assert_same(16, count($result['LTF_SF']), $case['symbol'] . ' ' . $case['timeframe'] . ' must keep 16 LTF levels');
    fib_test_assert_same(16, count($result['HTF_AF']), $case['symbol'] . ' ' . $case['timeframe'] . ' must expose 16 HTF_AF levels');

    foreach ($ratios as $ratio) {
        $ltfLevel = fib_test_find_level($result['LTF_SF'], $ratio);
        fib_test_assert_near($expectedLtf[(string) $ratio], $ltfLevel['price'], 0.00001, $case['symbol'] . ' ' . $case['timeframe'] . ' LTF ratio ' . $ratio . ' mismatch');
        fib_test_assert_same('LTF_SF', $ltfLevel['family'], $case['symbol'] . ' ' . $case['timeframe'] . ' LTF family mismatch');

        $htfLevel = fib_test_find_level($result['HTF_AF'], $ratio);
        fib_test_assert_near($case['expected_htf'][(string) $ratio], $htfLevel['price'], 0.00001, $case['symbol'] . ' ' . $case['timeframe'] . ' HTF ratio ' . $ratio . ' mismatch');
        fib_test_assert_same('HTF_AF', $htfLevel['family'], $case['symbol'] . ' ' . $case['timeframe'] . ' HTF family mismatch');
    }
}

fwrite(STDOUT, 'fib parity checks passed' . PHP_EOL);
