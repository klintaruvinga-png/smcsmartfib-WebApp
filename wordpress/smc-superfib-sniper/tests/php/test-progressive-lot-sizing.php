<?php

require_once __DIR__ . '/fib-test-helpers.php';

function progressive_price($high, $low, $ratio) {
    return round((float) $high - (((float) $ratio / 100) * ((float) $high - (float) $low)), 8);
}

function progressive_expected_plan($risk_usc, $high, $low, $direction, $pip, $pip_val, $currency = 'USC') {
    $entry_ratios = $direction === 'LONG' ? array('e1' => 62.5, 'e2' => 75.0, 'e3' => 100.0) : array('e1' => 25.0, 'e2' => 0.0, 'e3' => -25.0);
    $stop_ratios = $direction === 'LONG' ? array('e1' => 75.0, 'e2' => 100.0, 'e3' => 125.0) : array('e1' => 0.0, 'e2' => -25.0, 'e3' => -62.5);
    $alloc = array('e1' => 0.20, 'e2' => 0.30, 'e3' => 0.50);
    $spread = $pip >= 0.01 ? 0.15 : 0.00015;
    $entries = array();
    $stops = array();
    $lots = array();
    $stage_risk_amounts = array();
    $sizing_risk = $risk_usc;

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
        $stage_risk = $sizing_risk * $alloc[$stage];
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

function progressive_seed_account_telemetry($user_id, $equity, $last_seen_at = null, array $overrides = array()) {
    $seen_at = $last_seen_at ?: gmdate('Y-m-d H:i:s');
    fib_test_seed_row('account_telemetry', array_merge(array(
        'user_id' => (int) $user_id,
        'account_id' => 'acc-' . (int) $user_id,
        'terminal_id' => 'term-' . (int) $user_id,
        'balance' => (float) $equity,
        'equity' => (float) $equity,
        'margin' => 0,
        'free_margin' => (float) $equity,
        'margin_level' => 0,
        'floating_pl' => 0,
        'currency' => 'USC',
        'leverage' => 500,
        'ea_version' => 'test',
        'last_seen_at' => $seen_at,
        'updated_at' => $seen_at,
        'raw_json' => '{}',
    ), $overrides));
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
        'equityUSC' => 10000000.0,
        'updatedAt' => gmdate('c'),
    ),
));
progressive_seed_account_telemetry(101, 10000000.0);
fib_test_seed_snapshot(101, 'GBPUSD', 1.2742);

$gbpusd_plan = progressive_build_plan(101, array(
    'id' => 'sig-gbpusd',
    'symbol' => 'GBPUSD',
    'direction' => 'LONG',
), 1.3000, 1.2600);

$expected_gbpusd = progressive_expected_plan(100000.0, 1.3000, 1.2600, 'LONG', 0.0001, 10.0);
foreach ($expected_gbpusd['entries'] as $stage => $expected_entry) {
    fib_test_assert_near($expected_entry, $gbpusd_plan['entries'][$stage], 0.000001, 'GBPUSD entry mismatch for ' . $stage);
}
foreach ($expected_gbpusd['stops'] as $stage => $expected_stop) {
    fib_test_assert_near($expected_stop, $gbpusd_plan['stops'][$stage], 0.000001, 'GBPUSD stop mismatch for ' . $stage);
}
foreach ($expected_gbpusd['lots'] as $stage => $expected_lot) {
    fib_test_assert_near($expected_lot, $gbpusd_plan['lotSize'][$stage], 0.000001, 'GBPUSD lot mismatch for ' . $stage);
}
fib_test_assert_same(100000.0, $gbpusd_plan['riskUSC'], 'GBPUSD riskUSC should be derived from account equity and per-trade risk');
fib_test_assert_true($gbpusd_plan['lotSize']['e1'] < $gbpusd_plan['lotSize']['e2'], 'GBPUSD E2 lot must exceed E1');
fib_test_assert_true($gbpusd_plan['lotSize']['e2'] < $gbpusd_plan['lotSize']['e3'], 'GBPUSD E3 lot must exceed E2');
fib_test_assert_true($gbpusd_plan['entries']['e2'] > $gbpusd_plan['stops']['e1'], 'GBPUSD BUY E2 must sit above the E1 stop');
fib_test_assert_true($gbpusd_plan['entries']['e3'] > $gbpusd_plan['stops']['e2'], 'GBPUSD BUY E3 must sit above the E2 stop');
fib_test_assert_true($expected_gbpusd['totalRisk'] <= $gbpusd_plan['riskUSC'], 'GBPUSD staged risk must stay within the configured family risk cap');

fib_test_reset_env(111);
fib_test_seed_account_blob(111, array(
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
progressive_seed_account_telemetry(111, 100000.0);
fib_test_seed_snapshot(111, 'GBPUSD', 1.2742);

$cent_account_plan = progressive_build_plan(111, array(
    'id' => 'sig-usc-cent-account',
    'symbol' => 'GBPUSD',
    'direction' => 'LONG',
), 1.3000, 1.2600);

$expected_cent_account = progressive_expected_plan(1000.0, 1.3000, 1.2600, 'LONG', 0.0001, 10.0);
foreach ($expected_cent_account['lots'] as $stage => $expected_lot) {
    fib_test_assert_near($expected_lot, $cent_account_plan['lotSize'][$stage], 0.000001, 'USC cent account lot mismatch for ' . $stage);
}
fib_test_assert_same(1000.0, $cent_account_plan['riskUSC'], 'USC cent account riskUSC should keep the cent-denominated risk budget');
fib_test_assert_true($expected_cent_account['totalRisk'] <= $cent_account_plan['riskUSC'], 'USC cent account staged risk must stay within the USC risk cap');

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
        'equityUSC' => 8000000.0,
        'updatedAt' => gmdate('c'),
    ),
));
progressive_seed_account_telemetry(202, 8000000.0);
fib_test_seed_snapshot(202, 'GBPUSD', 1.2675);

$eurgbp_plan = progressive_build_plan(202, array(
    'id' => 'sig-eurgbp',
    'symbol' => 'EURGBP',
    'direction' => 'SHORT',
), 0.8610, 0.8450);

$gbp_quote_pip_value = round((100000 * 0.0001) * 1.2675, 6);
$expected_eurgbp = progressive_expected_plan(60000.0, 0.8610, 0.8450, 'SHORT', 0.0001, $gbp_quote_pip_value);
$fallback_eurgbp = progressive_expected_plan(60000.0, 0.8610, 0.8450, 'SHORT', 0.0001, 10.0);
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

fib_test_reset_env(212);
fib_test_seed_account_blob(212, array(
    'riskProfile' => array(
        'tier' => 'balanced',
        'maxConcurrentTrades' => 3,
        'perTradePct' => 0.5,
        'dailyMaxPct' => 2.0,
        'ddCapPct' => 6.0,
        'cooldownMin' => 30,
        'updatedAt' => gmdate('c'),
    ),
    'account' => array(
        'equityUSC' => 9206.75,
        'updatedAt' => gmdate('c'),
    ),
));
progressive_seed_account_telemetry(212, 9206.75);
fib_test_seed_snapshot(212, 'GBPUSD', 1.2675);

$usc_eurgbp_plan = progressive_build_plan(212, array(
    'id' => 'sig-usc-eurgbp',
    'symbol' => 'EURGBP',
    'direction' => 'SHORT',
), 0.8610, 0.8450);

fib_test_assert_same(46.03, $usc_eurgbp_plan['riskUSC'], 'USC account risk must remain cent-denominated');
fib_test_assert_near(8.52, $usc_eurgbp_plan['riskZAR'], 0.01, 'USC account ZAR risk must convert cents through USD first');
fib_test_assert_same(0.01, $usc_eurgbp_plan['minExecutableLot'], 'USC account forex plan should publish a 0.01 minimum lot');
fib_test_assert_true(
    max($usc_eurgbp_plan['lotSize']['e1'], $usc_eurgbp_plan['lotSize']['e2'], $usc_eurgbp_plan['lotSize']['e3']) >= 0.01,
    'USC account EURGBP plan should produce at least one executable 0.01+ lot stage'
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
progressive_seed_account_telemetry(303, 100.0);
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

fib_test_reset_env(404);
fib_test_seed_account_blob(404, array(
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
        'equityUSC' => 0.0,
        'updatedAt' => gmdate('c', time() - 301),
    ),
));
progressive_seed_account_telemetry(404, 5000000.0);
fib_test_seed_snapshot(404, 'GBPUSD', 1.2742);

$telemetry_authority_plan = progressive_build_plan(404, array(
    'id' => 'sig-telemetry-authority',
    'symbol' => 'GBPUSD',
    'direction' => 'LONG',
), 1.3000, 1.2600);

$expected_telemetry_authority = progressive_expected_plan(50000.0, 1.3000, 1.2600, 'LONG', 0.0001, 10.0);
foreach ($expected_telemetry_authority['lots'] as $stage => $expected_lot) {
    fib_test_assert_near($expected_lot, $telemetry_authority_plan['lotSize'][$stage], 0.000001, 'Telemetry authority lot mismatch for ' . $stage);
}
fib_test_assert_same(50000.0, $telemetry_authority_plan['riskUSC'], 'Telemetry authority riskUSC must be derived from live telemetry equity');
fib_test_assert_same('ACTIVE', $telemetry_authority_plan['state'], 'Live telemetry with positive equity must keep the plan ACTIVE');

fib_test_reset_env(505);
fib_test_seed_account_blob(505, array(
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
        'equityUSC' => 75000.0,
        'updatedAt' => gmdate('c'),
    ),
));
progressive_seed_account_telemetry(505, 75000.0, gmdate('Y-m-d H:i:s', time() - 601));
fib_test_seed_snapshot(505, 'GBPUSD', 1.2742);

$invalid_plan = progressive_build_plan(505, array(
    'id' => 'sig-invalid-telemetry',
    'symbol' => 'GBPUSD',
    'direction' => 'LONG',
), 1.3000, 1.2600);

fib_test_assert_same('INVALID', $invalid_plan['state'], 'Stale telemetry must invalidate plan sizing');
fib_test_assert_same(0.0, $invalid_plan['riskUSC'], 'Stale telemetry must zero plan riskUSC');
fib_test_assert_same(0.0, $invalid_plan['riskZAR'], 'Stale telemetry must zero plan riskZAR');
fib_test_assert_same(0.0, $invalid_plan['drawdownImpactPct'], 'Stale telemetry must zero drawdown impact');
fib_test_assert_same(0.0, $invalid_plan['lotSize']['e1'], 'Stale telemetry must zero E1 lot size');
fib_test_assert_same(0.0, $invalid_plan['lotSize']['e2'], 'Stale telemetry must zero E2 lot size');
fib_test_assert_same(0.0, $invalid_plan['lotSize']['e3'], 'Stale telemetry must zero E3 lot size');

fwrite(STDOUT, 'progressive lot sizing regression checks passed' . PHP_EOL);
