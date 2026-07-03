<?php

require_once __DIR__ . '/fib-test-helpers.php';

fib_test_reset_env(606);
$instance = fib_test_make_rest_instance();

$cases = array(
    array(
        'symbol' => 'EURUSD',
        'direction' => 'LONG',
        'swing_hi' => 1.1050,
        'swing_lo' => 1.1000,
        'expected' => 1.0980,
    ),
    array(
        'symbol' => 'EURUSD',
        'direction' => 'SHORT',
        'swing_hi' => 1.1050,
        'swing_lo' => 1.1000,
        'expected' => 1.1070,
    ),
    array(
        'symbol' => 'XAUUSD',
        'direction' => 'LONG',
        'swing_hi' => 1820.00,
        'swing_lo' => 1815.00,
        'expected' => 1814.50,
    ),
    array(
        'symbol' => 'US30',
        'direction' => 'SHORT',
        'swing_hi' => 38000.0,
        'swing_lo' => 37950.0,
        'expected' => 38030.0,
    ),
);

foreach ($cases as $case) {
    $actual = fib_test_invoke_private_method(
        $instance,
        'get_sl_from_sweep',
        array(
            $case['direction'],
            0.0,
            0.0,
            $case['swing_hi'],
            $case['swing_lo'],
            $case['symbol'],
        )
    );

    fib_test_assert_near(
        $case['expected'],
        $actual,
        0.0001,
        sprintf('get_sl_from_sweep floor for %s %s', $case['symbol'], $case['direction'])
    );
}

fwrite(STDOUT, 'stop-floor parity checks passed' . PHP_EOL);
