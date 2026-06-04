<?php

require_once __DIR__ . '/fib-test-helpers.php';

$service = new SMC_MarketData_Service();

$dailyToWeekly = array(
    fib_test_make_candle('2026-04-06 12:00:00 UTC', 10, 1),
    fib_test_make_candle('2026-04-13 12:00:00 UTC', 20, 2),
    fib_test_make_candle('2026-04-20 12:00:00 UTC', 30, 3),
    fib_test_make_candle('2026-04-27 12:00:00 UTC', 40, 4),
    fib_test_make_candle('2026-05-04 12:00:00 UTC', 50, 5),
);
$anchor = $service->resolve_htf_authority_anchor($dailyToWeekly, 900);
fib_test_assert_same(true, $anchor['valid'], 'Daily->Weekly anchor should be valid');
fib_test_assert_near(40.0, $anchor['high'], 0.000001, 'Daily->Weekly high mismatch');
fib_test_assert_near(4.0, $anchor['low'], 0.000001, 'Daily->Weekly low mismatch');

$dailyToWeeklyIsoBoundary = array(
    fib_test_make_candle('2024-12-16 12:00:00 UTC', 100, 10),
    fib_test_make_candle('2024-12-23 12:00:00 UTC', 200, 20),
    fib_test_make_candle('2024-12-30 12:00:00 UTC', 300, 30),
    fib_test_make_candle('2025-01-06 12:00:00 UTC', 400, 40),
    fib_test_make_candle('2025-01-13 12:00:00 UTC', 500, 50),
);
$anchor = $service->resolve_htf_authority_anchor($dailyToWeeklyIsoBoundary, 900);
fib_test_assert_same(true, $anchor['valid'], 'Daily->Weekly ISO boundary anchor should be valid');
fib_test_assert_near(400.0, $anchor['high'], 0.000001, 'Daily->Weekly ISO boundary high mismatch');
fib_test_assert_near(40.0, $anchor['low'], 0.000001, 'Daily->Weekly ISO boundary low mismatch');

$weeklyToMonthly = array(
    fib_test_make_candle('2026-01-06 12:00:00 UTC', 10, 1),
    fib_test_make_candle('2026-02-03 12:00:00 UTC', 20, 2),
    fib_test_make_candle('2026-03-03 12:00:00 UTC', 30, 3),
    fib_test_make_candle('2026-04-07 12:00:00 UTC', 40, 4),
    fib_test_make_candle('2026-05-05 12:00:00 UTC', 50, 5),
);
$anchor = $service->resolve_htf_authority_anchor($weeklyToMonthly, 3600);
fib_test_assert_same(true, $anchor['valid'], 'Weekly->Monthly anchor should be valid');
fib_test_assert_near(40.0, $anchor['high'], 0.000001, 'Weekly->Monthly high mismatch');
fib_test_assert_near(4.0, $anchor['low'], 0.000001, 'Weekly->Monthly low mismatch');

$monthlyToQuarterly = array(
    fib_test_make_candle('2025-01-15 12:00:00 UTC', 100, 10),
    fib_test_make_candle('2025-04-15 12:00:00 UTC', 200, 20),
    fib_test_make_candle('2025-07-15 12:00:00 UTC', 300, 30),
    fib_test_make_candle('2025-10-15 12:00:00 UTC', 400, 40),
    fib_test_make_candle('2026-01-15 12:00:00 UTC', 500, 50),
);
$anchor = $service->resolve_htf_authority_anchor($monthlyToQuarterly, 14400);
fib_test_assert_same(true, $anchor['valid'], 'Monthly->Quarterly anchor should be valid');
fib_test_assert_near(400.0, $anchor['high'], 0.000001, 'Monthly->Quarterly high mismatch');
fib_test_assert_near(40.0, $anchor['low'], 0.000001, 'Monthly->Quarterly low mismatch');

$quarterlyToYearly = array(
    fib_test_make_candle('2021-10-15 12:00:00 UTC', 100, 10),
    fib_test_make_candle('2022-10-15 12:00:00 UTC', 200, 20),
    fib_test_make_candle('2023-10-15 12:00:00 UTC', 300, 30),
    fib_test_make_candle('2024-10-15 12:00:00 UTC', 400, 40),
    fib_test_make_candle('2025-10-15 12:00:00 UTC', 500, 50),
);
$anchor = $service->resolve_htf_authority_anchor($quarterlyToYearly, 86400);
fib_test_assert_same(true, $anchor['valid'], 'Quarterly->Yearly anchor should be valid');
fib_test_assert_near(400.0, $anchor['high'], 0.000001, 'Quarterly->Yearly high mismatch');
fib_test_assert_near(40.0, $anchor['low'], 0.000001, 'Quarterly->Yearly low mismatch');

$yearlyToYearly = array(
    fib_test_make_candle('2021-06-15 12:00:00 UTC', 100, 10),
    fib_test_make_candle('2022-06-15 12:00:00 UTC', 200, 20),
    fib_test_make_candle('2023-06-15 12:00:00 UTC', 300, 30),
    fib_test_make_candle('2024-06-15 12:00:00 UTC', 400, 40),
    fib_test_make_candle('2025-06-15 12:00:00 UTC', 500, 50),
);
$anchor = $service->resolve_htf_authority_anchor($yearlyToYearly, 604800);
fib_test_assert_same(true, $anchor['valid'], 'Yearly->Yearly anchor should be valid');
fib_test_assert_near(400.0, $anchor['high'], 0.000001, 'Yearly->Yearly high mismatch');
fib_test_assert_near(40.0, $anchor['low'], 0.000001, 'Yearly->Yearly low mismatch');

$singleCompletedPlusActive = array(
    fib_test_make_candle('2026-04-27 12:00:00 UTC', 40, 4),
    fib_test_make_candle('2026-05-04 12:00:00 UTC', 50, 5),
);
$anchor = $service->resolve_htf_authority_anchor($singleCompletedPlusActive, 900);
fib_test_assert_same(true, $anchor['valid'], 'Single completed HTF anchor should be valid');
fib_test_assert_near(40.0, $anchor['high'], 0.000001, 'Single completed HTF high mismatch');
fib_test_assert_near(4.0, $anchor['low'], 0.000001, 'Single completed HTF low mismatch');

$onlyActiveSession = array(
    fib_test_make_candle('2026-05-04 12:00:00 UTC', 50, 5),
);
$anchor = $service->resolve_htf_authority_anchor($onlyActiveSession, 900);
fib_test_assert_same(false, $anchor['valid'], 'Only active HTF session should be invalid');

$aggregatedMostRecentCompleted = array(
    fib_test_make_candle('2026-04-13 12:00:00 UTC', 20, 2),
    fib_test_make_candle('2026-04-20 12:00:00 UTC', 31, 3),
    fib_test_make_candle('2026-04-21 12:00:00 UTC', 35, 2.5),
    fib_test_make_candle('2026-04-27 12:00:00 UTC', 50, 5),
);
$anchor = $service->resolve_htf_authority_anchor($aggregatedMostRecentCompleted, 900);
fib_test_assert_same(true, $anchor['valid'], 'Aggregated most recent completed HTF anchor should be valid');
fib_test_assert_near(35.0, $anchor['high'], 0.000001, 'Aggregated most recent completed HTF high mismatch');
fib_test_assert_near(2.5, $anchor['low'], 0.000001, 'Aggregated most recent completed HTF low mismatch');

fwrite(STDOUT, 'htf authority anchor checks passed' . PHP_EOL);
