<?php

require_once __DIR__ . '/fib-test-helpers.php';

$instance = fib_test_make_rest_instance();

$cases = array(
    array(
        'name' => 'three-anchor weighting',
        'candles' => array(
            fib_test_make_candle('2026-05-10 12:00:00 UTC', 120, 100),
            fib_test_make_candle('2026-05-11 12:00:00 UTC', 130, 90),
            fib_test_make_candle('2026-05-12 12:00:00 UTC', 110, 80),
            fib_test_make_candle('2026-05-13 12:00:00 UTC', 140, 70),
        ),
        'expected_high' => 119.5,
        'expected_low' => 88.5,
    ),
    array(
        'name' => 'two-anchor weighting',
        'candles' => array(
            fib_test_make_candle('2026-05-11 12:00:00 UTC', 130, 90),
            fib_test_make_candle('2026-05-12 12:00:00 UTC', 110, 80),
            fib_test_make_candle('2026-05-13 12:00:00 UTC', 140, 70),
        ),
        'expected_high' => 119.0,
        'expected_low' => 84.5,
    ),
    array(
        'name' => 'one-anchor weighting',
        'candles' => array(
            fib_test_make_candle('2026-05-12 12:00:00 UTC', 110, 80),
            fib_test_make_candle('2026-05-13 12:00:00 UTC', 140, 70),
        ),
        'expected_high' => 110.0,
        'expected_low' => 80.0,
    ),
);

foreach ($cases as $case) {
    fib_test_set_private_property($instance, 'fib_context_symbol', 'EURUSD');
    fib_test_set_private_property($instance, 'fib_context_timeframe', '15min');
    fib_test_set_private_property($instance, 'fib_context_tf_seconds', 900);
    $result = fib_test_invoke_private_method($instance, 'fib_levels_from_candles', array($case['candles']));
    $ltf = $result['LTF_SF'];

    fib_test_assert_same(true, is_array($ltf), $case['name'] . ' must return LTF_SF fibs');
    fib_test_assert_same(16, count($ltf), $case['name'] . ' must keep the 16-ratio set');
    fib_test_assert_near($case['expected_high'], fib_test_find_level($ltf, 0)['price'], 0.000001, $case['name'] . ' high mismatch');
    fib_test_assert_near($case['expected_low'], fib_test_find_level($ltf, 100)['price'], 0.000001, $case['name'] . ' low mismatch');
}

fwrite(STDOUT, 'superfib weighting checks passed' . PHP_EOL);
