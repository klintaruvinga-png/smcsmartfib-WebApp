<?php

require_once __DIR__ . '/fib-test-helpers.php';

fib_test_reset_env(606);
$instance = fib_test_make_rest_instance();

foreach (array(
    'EURUSD',
    'GBPUSD',
    'EURGBP',
    'GBPAUD',
    'AUDCAD',
    'CADJPY',
    'CHFJPY',
) as $symbol) {
    fib_test_assert_near(
        0.01,
        fib_test_invoke_private_method($instance, 'get_min_executable_lot', array($symbol, 606)),
        0.000001,
        $symbol . ' should use the standard forex 0.01 minimum lot'
    );
}

fib_test_assert_near(
    0.10,
    fib_test_invoke_private_method($instance, 'get_min_executable_lot', array('USDZAR', 606)),
    0.000001,
    'Standard USDZAR should keep the 0.10 executable minimum'
);

foreach (array('USDZAR.micro', 'USDZAR.cent', 'USDZAR.m', 'USDZAR.c') as $symbol) {
    fib_test_assert_near(
        0.01,
        fib_test_invoke_private_method($instance, 'get_min_executable_lot', array($symbol, 606)),
        0.000001,
        $symbol . ' should be treated as a cent/micro forex symbol with a 0.01 minimum'
    );
}

fib_test_seed_row('account_telemetry', array(
    'user_id' => 606,
    'account_id' => 'acc-606',
    'terminal_id' => 'term-606',
    'balance' => 9206.75,
    'equity' => 9206.75,
    'margin' => 0,
    'free_margin' => 9206.75,
    'margin_level' => 0,
    'floating_pl' => 0,
    'currency' => 'USC',
    'leverage' => 500,
    'ea_version' => 'test',
    'last_seen_at' => gmdate('Y-m-d H:i:s'),
    'updated_at' => gmdate('Y-m-d H:i:s'),
    'raw_json' => '{}',
));
fib_test_seed_row('symbol_sync', array(
    'user_id' => 606,
    'account_id' => 'acc-606',
    'terminal_id' => 'term-606',
    'broker_symbol' => 'EURGBP.micro',
    'normalized_symbol' => 'EURGBP',
    'min_lot' => 0.10,
    'last_seen_at' => gmdate('Y-m-d H:i:s'),
));

fib_test_assert_near(
    0.01,
    fib_test_invoke_private_method($instance, 'get_min_executable_lot', array('EURGBP', 606)),
    0.000001,
    'USC cent account should allow 0.01 forex lots even when stale broker sync reports 0.10'
);

foreach (array(
    607 => 'ZAR.c',
    608 => 'EUR Micro',
) as $user_id => $currency) {
    fib_test_reset_env($user_id);
    $instance = fib_test_make_rest_instance();
    fib_test_seed_row('account_telemetry', array(
        'user_id' => $user_id,
        'account_id' => 'acc-' . $user_id,
        'terminal_id' => 'term-' . $user_id,
        'balance' => 9206.75,
        'equity' => 9206.75,
        'margin' => 0,
        'free_margin' => 9206.75,
        'margin_level' => 0,
        'floating_pl' => 0,
        'currency' => $currency,
        'leverage' => 500,
        'ea_version' => 'test',
        'last_seen_at' => gmdate('Y-m-d H:i:s'),
        'updated_at' => gmdate('Y-m-d H:i:s'),
        'raw_json' => '{}',
    ));

    fib_test_assert_near(
        0.01,
        fib_test_invoke_private_method($instance, 'get_min_executable_lot', array('USDZAR', $user_id)),
        0.000001,
        $currency . ' account currency should allow 0.01 forex lots independent of symbol suffix'
    );
}

fwrite(STDOUT, 'forex min-lot parity checks passed' . PHP_EOL);
