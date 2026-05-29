<?php

require_once __DIR__ . '/fib-test-helpers.php';

function progressive_price($high, $low, $ratio) {
    return round((float) $high - (((float) $ratio / 100) * ((float) $high - (float) $low)), 8);
}

function progressive_expected_plan($risk_usc, $high, $low, $direction, $pip, $pip_val) {
    $entry_ratios = $direction === 'LONG' ? array('e1' => 62.5, 'e2' => 75.0, 'e3' => 100.0) : array('e1' => 25.0, 'e2' => 0.0, 'e3' => -25.0);
    $stop_ratios = $direction === 'LONG' ? array('e1' => 75.0, 'e2' => 100.0, 'e3' => 125.0) : array('e1' => 0.0, 'e2' => -25.0, 'e3' => -62.5);
    $alloc = array('e1' => 0.20, 'e2' => 0.30, 'e3' => 0.50);
    $spread = $pip >= 0.01 ? 0.15 : 0.00015;
    $entries = array();
    $stops = array();
    $lots = array();
    $stage_risk_amounts = array();

    foreach (array('e1', 'e2', 'e3') as $stage) {
        $entries[$stage] = progressive_price($high, $low, $entry_ratios[$stage]);
        $stops[$stage] = progressive_price($high, $low, $stop_ratios[$stage]);
    }

    $entries['e2'] = $direction === 'LONG'
        ? round($stops['e1'] + $spread, 8)
        : round($stops['e1'] - $spread, 8);
    $entries['e3'] = $direction === 'LONG'
        ? round($stops['e2'] + $spread, 8)
        : round($stops['e2'] - $spread, 8);

    foreach (array('e1', 'e2', 'e3') as $stage) {
        $entry = $entries[$stage];
        $stop = $stops[$stage];
        $stop_dist = max(abs($entry - $stop), $pip);
        $stop_pips = $stop_dist / $pip;
        $stage_risk = $risk_usc * $alloc[$stage];
        $raw_lots = $stage_risk / max($stop_pips * $pip_val, 0.01);
        $stage_lot = floor($raw_lots * 100) / 100;
        $lots[$stage] = $stage_lot >= 0.01 ? round($stage_lot, 2) : 0.0;
    }

    foreach (array(array('e1', 'e2'), array('e2', 'e3')) as $pair) {
        list($stage, $next_stage) = $pair;
        if ($lots[$next_stage] <= 0.0) {
            $lots[$stage] = 0.0;
            continue;
        }
        if ($lots[$stage] >= $lots[$next_stage]) {
            $lots[$stage] = max(0.0, round($lots[$next_stage] - 0.01, 2));
        }
    }

    foreach (array('e1', 'e2', 'e3') as $stage) {
        $entry = $entries[$stage];
        $stop = $stops[$stage];
        $stop_dist = max(abs($entry - $stop), $pip);
        $stop_pips = $stop_dist / $pip;
        $stage_risk_amounts[$stage] = round($lots[$stage] * $stop_pips * $pip_val, 2);
    }

    return array(
        'entries' => $entries,
        'stops' => $stops,
        'lots' => $lots,
        'stageRiskAmounts' => $stage_risk_amounts,
        'totalRisk' => array_sum($stage_risk_amounts),
    );
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

$expected_gbpusd = progressive_expected_plan(1000.0, 1.3000, 1.2600, 'LONG', 0.0001, 10.0);
foreach ($expected_gbpusd['entries'] as $stage => $expected_entry) {
    fib_test_assert_near($expected_entry, $gbpusd_plan['entries'][$stage], 0.000001, 'GBPUSD entry mismatch for ' . $stage);
}
foreach ($expected_gbpusd['stops'] as $stage => $expected_stop) {
    fib_test_assert_near($expected_stop, $gbpusd_plan['stops'][$stage], 0.000001, 'GBPUSD stop mismatch for ' . $stage);
}
foreach ($expected_gbpusd['lots'] as $stage => $expected_lot) {
    fib_test_assert_near($expected_lot, $gbpusd_plan['lotSize'][$stage], 0.000001, 'GBPUSD lot mismatch for ' . $stage);
}
fib_test_assert_same(1000.0, $gbpusd_plan['riskUSC'], 'GBPUSD riskUSC should be derived from account equity and per-trade risk');
fib_test_assert_true($gbpusd_plan['lotSize']['e1'] < $gbpusd_plan['lotSize']['e2'], 'GBPUSD E2 lot must exceed E1');
fib_test_assert_true($gbpusd_plan['lotSize']['e2'] < $gbpusd_plan['lotSize']['e3'], 'GBPUSD E3 lot must exceed E2');
fib_test_assert_true($gbpusd_plan['entries']['e2'] > $gbpusd_plan['stops']['e1'], 'GBPUSD BUY E2 must sit above the E1 stop');
fib_test_assert_true($gbpusd_plan['entries']['e3'] > $gbpusd_plan['stops']['e2'], 'GBPUSD BUY E3 must sit above the E2 stop');
fib_test_assert_true($expected_gbpusd['totalRisk'] <= $gbpusd_plan['riskUSC'], 'GBPUSD staged risk must stay within the configured family risk cap');

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
$expected_eurgbp = progressive_expected_plan(600.0, 0.8610, 0.8450, 'SHORT', 0.0001, $gbp_quote_pip_value);
$fallback_eurgbp = progressive_expected_plan(600.0, 0.8610, 0.8450, 'SHORT', 0.0001, 10.0);
foreach ($expected_eurgbp['entries'] as $stage => $expected_entry) {
    fib_test_assert_near($expected_entry, $eurgbp_plan['entries'][$stage], 0.000001, 'EURGBP entry mismatch for ' . $stage);
}
foreach ($expected_eurgbp['stops'] as $stage => $expected_stop) {
    fib_test_assert_near($expected_stop, $eurgbp_plan['stops'][$stage], 0.000001, 'EURGBP stop mismatch for ' . $stage);
}
foreach ($expected_eurgbp['lots'] as $stage => $expected_lot) {
    fib_test_assert_near($expected_lot, $eurgbp_plan['lotSize'][$stage], 0.000001, 'EURGBP lot mismatch for ' . $stage);
}
fib_test_assert_true(
    abs($expected_eurgbp['lots']['e1'] - $fallback_eurgbp['lots']['e1']) >= 0.01,
    'EURGBP case must prove market-aware quote-to-USD pip valuation changes the backend lot size',
);
fib_test_assert_true($eurgbp_plan['lotSize']['e1'] < $eurgbp_plan['lotSize']['e2'], 'EURGBP E2 lot must exceed E1');
fib_test_assert_true($eurgbp_plan['lotSize']['e2'] < $eurgbp_plan['lotSize']['e3'], 'EURGBP E3 lot must exceed E2');
fib_test_assert_true($eurgbp_plan['entries']['e2'] < $eurgbp_plan['stops']['e1'], 'EURGBP SELL E2 must sit below the E1 stop');
fib_test_assert_true($eurgbp_plan['entries']['e3'] < $eurgbp_plan['stops']['e2'], 'EURGBP SELL E3 must sit below the E2 stop');
fib_test_assert_true($expected_eurgbp['totalRisk'] <= $eurgbp_plan['riskUSC'], 'EURGBP staged risk must stay within the configured family risk cap');

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

$expected_floor = progressive_expected_plan(0.1, 1.5000, 1.0000, 'LONG', 0.0001, 10.0);
fib_test_assert_same(0.0, $floor_plan['lotSize']['e1'], 'Tiny budget should not force E1 above the family risk cap');
fib_test_assert_same(0.0, $floor_plan['lotSize']['e2'], 'Tiny budget should not force E2 above the family risk cap');
fib_test_assert_same(0.0, $floor_plan['lotSize']['e3'], 'Tiny budget should not force E3 above the family risk cap');
fib_test_assert_true($expected_floor['totalRisk'] <= $floor_plan['riskUSC'], 'Tiny budget scenario must remain within the configured family risk cap');

fwrite(STDOUT, 'progressive lot sizing regression checks passed' . PHP_EOL);
