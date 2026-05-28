<?php

require_once __DIR__ . '/fib-test-helpers.php';

function progressive_price($high, $low, $ratio) {
    return round((float) $high - (((float) $ratio / 100) * ((float) $high - (float) $low)), 8);
}

function progressive_expected_lots($risk_usc, $high, $low, $direction, $pip, $pip_val) {
    $entry_ratios = $direction === 'LONG' ? array('e1' => 62.5, 'e2' => 75.0, 'e3' => 100.0) : array('e1' => 25.0, 'e2' => 0.0, 'e3' => -25.0);
    $stop_ratios = $direction === 'LONG' ? array('e1' => 75.0, 'e2' => 100.0, 'e3' => 125.0) : array('e1' => 0.0, 'e2' => -25.0, 'e3' => -62.5);
    $weights = array('e1' => 1, 'e2' => 2, 'e3' => 3);
    $lots = array();

    foreach (array('e1', 'e2', 'e3') as $stage) {
        $entry = progressive_price($high, $low, $entry_ratios[$stage]);
        $stop = progressive_price($high, $low, $stop_ratios[$stage]);
        $stop_dist = max(abs($entry - $stop), $pip);
        $stop_pips = $stop_dist / $pip;
        $stage_risk = $risk_usc * ($weights[$stage] / 6.0);
        $raw_lots = $stage_risk / max($stop_pips * $pip_val, 0.01);
        $lots[$stage] = max(0.01, round($raw_lots / 0.01) * 0.01);
    }

    return $lots;
}

function progressive_build_plan($user_id, array $signal, $high, $low) {
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

fib_test_reset_env(101);
fib_test_seed_account_blob(101, array(
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
fib_test_seed_snapshot(101, 'GBPUSD', 1.2742);

$gbpusd_plan = progressive_build_plan(101, array(
    'id' => 'sig-gbpusd',
    'symbol' => 'GBPUSD',
    'direction' => 'LONG',
), 1.3000, 1.2600);

$expected_gbpusd = progressive_expected_lots(1000.0, 1.3000, 1.2600, 'LONG', 0.0001, 10.0);
foreach ($expected_gbpusd as $stage => $expected_lot) {
    fib_test_assert_near($expected_lot, $gbpusd_plan['lotSize'][$stage], 0.000001, 'GBPUSD lot mismatch for ' . $stage);
}
fib_test_assert_same(1000.0, $gbpusd_plan['riskUSC'], 'GBPUSD riskUSC should be derived from account equity and per-trade risk');
fib_test_assert_true(
    $gbpusd_plan['lotSize']['e1'] !== $gbpusd_plan['lotSize']['e3'] || $gbpusd_plan['lotSize']['e2'] !== $gbpusd_plan['lotSize']['e3'],
    'GBPUSD progressive ladder should not collapse into a flat three-stage lot size',
);

fib_test_reset_env(202);
fib_test_seed_account_blob(202, array(
    'riskProfile' => array(
        'tier' => 'balanced',
        'maxConcurrentTrades' => 3,
        'perTradePct' => 0.75,
        'dailyMaxPct' => 2.0,
        'ddCapPct' => 6.0,
        'cooldownMin' => 30,
        'updatedAt' => gmdate('c'),
    ),
    'account' => array(
        'equityUSC' => 80000.0,
        'updatedAt' => gmdate('c'),
    ),
));
fib_test_seed_snapshot(202, 'GBPUSD', 1.2675);

$eurgbp_plan = progressive_build_plan(202, array(
    'id' => 'sig-eurgbp',
    'symbol' => 'EURGBP',
    'direction' => 'SHORT',
), 0.8610, 0.8450);

$gbp_quote_pip_value = round((100000 * 0.0001) * 1.2675, 6);
$expected_eurgbp = progressive_expected_lots(600.0, 0.8610, 0.8450, 'SHORT', 0.0001, $gbp_quote_pip_value);
$fallback_eurgbp = progressive_expected_lots(600.0, 0.8610, 0.8450, 'SHORT', 0.0001, 10.0);
foreach ($expected_eurgbp as $stage => $expected_lot) {
    fib_test_assert_near($expected_lot, $eurgbp_plan['lotSize'][$stage], 0.000001, 'EURGBP lot mismatch for ' . $stage);
}
fib_test_assert_true(
    abs($expected_eurgbp['e1'] - $fallback_eurgbp['e1']) >= 0.01,
    'EURGBP case must prove market-aware quote-to-USD pip valuation changes the backend lot size',
);

fib_test_reset_env(303);
fib_test_seed_account_blob(303, array(
    'riskProfile' => array(
        'tier' => 'conservative',
        'maxConcurrentTrades' => 1,
        'perTradePct' => 0.1,
        'dailyMaxPct' => 2.0,
        'ddCapPct' => 6.0,
        'cooldownMin' => 30,
        'updatedAt' => gmdate('c'),
    ),
    'account' => array(
        'equityUSC' => 100.0,
        'updatedAt' => gmdate('c'),
    ),
));
fib_test_seed_snapshot(303, 'GBPUSD', 1.2500);

$floor_plan = progressive_build_plan(303, array(
    'id' => 'sig-floor',
    'symbol' => 'GBPUSD',
    'direction' => 'LONG',
), 1.5000, 1.0000);

fib_test_assert_same(0.01, $floor_plan['lotSize']['e1'], 'Minimum lot floor should hold for E1');
fib_test_assert_same(0.01, $floor_plan['lotSize']['e2'], 'Minimum lot floor should hold for E2');
fib_test_assert_same(0.01, $floor_plan['lotSize']['e3'], 'Minimum lot floor should hold for E3');

fwrite(STDOUT, 'progressive lot sizing regression checks passed' . PHP_EOL);
