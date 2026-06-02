<?php

require_once __DIR__ . '/fib-test-helpers.php';

function dxy_reference_seed_account_telemetry($user_id, $equity) {
    $seen_at = gmdate('Y-m-d H:i:s');
    fib_test_seed_row('account_telemetry', array(
        'user_id' => (int) $user_id,
        'account_id' => 'acc-' . (int) $user_id,
        'terminal_id' => 'term-' . (int) $user_id,
        'balance' => (float) $equity,
        'equity' => (float) $equity,
        'margin' => 0,
        'free_margin' => (float) $equity,
        'margin_level' => 0,
        'floating_pl' => 0,
        'currency' => 'USD',
        'leverage' => 500,
        'ea_version' => 'test',
        'last_seen_at' => $seen_at,
        'updated_at' => $seen_at,
        'raw_json' => '{}',
    ));
}

function dxy_reference_build_plan($user_id, array $signal, $high, $low) {
    $instance = fib_test_make_rest_instance();
    $sequence = array(
        'LONG' => array('sweep' => false),
        'SHORT' => array('sweep' => false),
    );
    $candles = array(
        fib_test_make_candle('2026-05-28T08:00:00Z', $high, $low, $low, $high),
    );

    return fib_test_invoke_private_method($instance, 'build_trade_plan', array(
        $user_id,
        $signal,
        $high,
        $low,
        $sequence,
        $candles,
    ));
}

fib_test_reset_env(151);
fib_test_seed_account_blob(151, array(
    'riskProfile' => array(
        'tier' => 'balanced',
        'maxConcurrentTrades' => 3,
        'perTradePct' => 1.0,
        'dailyMaxPct' => 2.0,
        'ddCapPct' => 6.0,
        'cooldownMin' => 30,
        'updatedAt' => gmdate('c'),
    ),
    'account' => array(
        'equityUSC' => 100000.0,
        'updatedAt' => gmdate('c'),
    ),
));
dxy_reference_seed_account_telemetry(151, 100000.0);

$instance = fib_test_make_rest_instance();
$spec = fib_test_invoke_private_method($instance, 'get_instrument_spec', array('DXYUSD'));
fib_test_assert_same('reference', $spec['type'] ?? null, 'DXYUSD must remain registered as a reference instrument');
fib_test_assert_true(
    fib_test_invoke_private_method($instance, 'is_supported_symbol', array('DXYUSD')),
    'DXYUSD must remain supported for watchlist/reference data flows'
);

$dxyusd_plan = dxy_reference_build_plan(151, array(
    'id' => 'sig-dxyusd-reference',
    'symbol' => 'DXYUSD',
    'direction' => 'LONG',
), 105.500, 104.250);

fib_test_assert_same(1000.0, $dxyusd_plan['riskUSC'], 'DXYUSD reference plan may report live risk context');
fib_test_assert_same(0.0, $dxyusd_plan['lotSize']['e1'], 'DXYUSD reference symbol must not size E1 lots');
fib_test_assert_same(0.0, $dxyusd_plan['lotSize']['e2'], 'DXYUSD reference symbol must not size E2 lots');
fib_test_assert_same(0.0, $dxyusd_plan['lotSize']['e3'], 'DXYUSD reference symbol must not size E3 lots');
fib_test_assert_same('ACTIVE', $dxyusd_plan['state'], 'DXYUSD reference plan stays informational when telemetry is live');

fwrite(STDOUT, 'DXYUSD reference lot sizing regression checks passed' . PHP_EOL);
