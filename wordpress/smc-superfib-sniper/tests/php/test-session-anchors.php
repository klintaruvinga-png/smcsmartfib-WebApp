<?php

require_once __DIR__ . '/fib-test-helpers.php';

$service = new SMC_MarketData_Service();

$dailyCandles = array(
    fib_test_make_candle('2026-05-10 09:00:00 UTC', 1.10, 1.00),
    fib_test_make_candle('2026-05-10 18:00:00 UTC', 1.20, 0.95),
    fib_test_make_candle('2026-05-11 09:00:00 UTC', 1.15, 0.90),
    fib_test_make_candle('2026-05-11 18:00:00 UTC', 1.25, 0.85),
    fib_test_make_candle('2026-05-12 09:00:00 UTC', 1.30, 1.00),
    fib_test_make_candle('2026-05-12 18:00:00 UTC', 1.35, 0.98),
    fib_test_make_candle('2026-05-13 09:00:00 UTC', 1.40, 1.05),
);
$dailyAnchors = $service->resolve_session_anchors($dailyCandles, 900);
fib_test_assert_same(true, $dailyAnchors['F1']['valid'], 'Daily F1 should be valid');
fib_test_assert_near(1.35, $dailyAnchors['F1']['high'], 0.000001, 'Daily F1 high mismatch');
fib_test_assert_near(0.98, $dailyAnchors['F1']['low'], 0.000001, 'Daily F1 low mismatch');
fib_test_assert_near(1.25, $dailyAnchors['F2']['high'], 0.000001, 'Daily F2 high mismatch');
fib_test_assert_near(0.85, $dailyAnchors['F2']['low'], 0.000001, 'Daily F2 low mismatch');
fib_test_assert_near(1.20, $dailyAnchors['F3']['high'], 0.000001, 'Daily F3 high mismatch');
fib_test_assert_near(0.95, $dailyAnchors['F3']['low'], 0.000001, 'Daily F3 low mismatch');

$weeklyCandles = array(
    fib_test_make_candle('2026-04-06 09:00:00 UTC', 10, 5),
    fib_test_make_candle('2026-04-08 09:00:00 UTC', 12, 4),
    fib_test_make_candle('2026-04-13 09:00:00 UTC', 20, 9),
    fib_test_make_candle('2026-04-15 09:00:00 UTC', 22, 8),
    fib_test_make_candle('2026-04-20 09:00:00 UTC', 30, 12),
    fib_test_make_candle('2026-04-22 09:00:00 UTC', 33, 11),
    fib_test_make_candle('2026-04-27 09:00:00 UTC', 40, 15),
    fib_test_make_candle('2026-04-29 09:00:00 UTC', 44, 14),
    fib_test_make_candle('2026-05-04 09:00:00 UTC', 50, 20),
);
$weeklyAnchors = $service->resolve_session_anchors($weeklyCandles, 3600);
fib_test_assert_near(44.0, $weeklyAnchors['F1']['high'], 0.000001, 'Weekly F1 high mismatch');
fib_test_assert_near(14.0, $weeklyAnchors['F1']['low'], 0.000001, 'Weekly F1 low mismatch');
fib_test_assert_near(33.0, $weeklyAnchors['F2']['high'], 0.000001, 'Weekly F2 high mismatch');
fib_test_assert_near(11.0, $weeklyAnchors['F2']['low'], 0.000001, 'Weekly F2 low mismatch');
fib_test_assert_near(22.0, $weeklyAnchors['F3']['high'], 0.000001, 'Weekly F3 high mismatch');
fib_test_assert_near(8.0, $weeklyAnchors['F3']['low'], 0.000001, 'Weekly F3 low mismatch');

$monthlyCandles = array(
    fib_test_make_candle('2026-01-10 12:00:00 UTC', 100, 50),
    fib_test_make_candle('2026-01-20 12:00:00 UTC', 110, 45),
    fib_test_make_candle('2026-02-10 12:00:00 UTC', 120, 60),
    fib_test_make_candle('2026-02-20 12:00:00 UTC', 130, 55),
    fib_test_make_candle('2026-03-10 12:00:00 UTC', 140, 70),
    fib_test_make_candle('2026-03-20 12:00:00 UTC', 150, 65),
    fib_test_make_candle('2026-04-10 12:00:00 UTC', 160, 80),
    fib_test_make_candle('2026-04-20 12:00:00 UTC', 170, 75),
    fib_test_make_candle('2026-05-10 12:00:00 UTC', 180, 90),
);
$monthlyAnchors = $service->resolve_session_anchors($monthlyCandles, 14400);
fib_test_assert_near(170.0, $monthlyAnchors['F1']['high'], 0.000001, 'Monthly F1 high mismatch');
fib_test_assert_near(75.0, $monthlyAnchors['F1']['low'], 0.000001, 'Monthly F1 low mismatch');
fib_test_assert_near(150.0, $monthlyAnchors['F2']['high'], 0.000001, 'Monthly F2 high mismatch');
fib_test_assert_near(65.0, $monthlyAnchors['F2']['low'], 0.000001, 'Monthly F2 low mismatch');
fib_test_assert_near(130.0, $monthlyAnchors['F3']['high'], 0.000001, 'Monthly F3 high mismatch');
fib_test_assert_near(55.0, $monthlyAnchors['F3']['low'], 0.000001, 'Monthly F3 low mismatch');

$quarterlyCandles = array(
    fib_test_make_candle('2025-01-15 12:00:00 UTC', 300, 100),
    fib_test_make_candle('2025-02-15 12:00:00 UTC', 320, 95),
    fib_test_make_candle('2025-04-15 12:00:00 UTC', 330, 110),
    fib_test_make_candle('2025-05-15 12:00:00 UTC', 340, 105),
    fib_test_make_candle('2025-07-15 12:00:00 UTC', 360, 120),
    fib_test_make_candle('2025-08-15 12:00:00 UTC', 370, 118),
    fib_test_make_candle('2025-10-15 12:00:00 UTC', 390, 130),
);
$quarterlyAnchors = $service->resolve_session_anchors($quarterlyCandles, 86400);
fib_test_assert_near(370.0, $quarterlyAnchors['F1']['high'], 0.000001, 'Quarterly F1 high mismatch');
fib_test_assert_near(118.0, $quarterlyAnchors['F1']['low'], 0.000001, 'Quarterly F1 low mismatch');
fib_test_assert_near(340.0, $quarterlyAnchors['F2']['high'], 0.000001, 'Quarterly F2 high mismatch');
fib_test_assert_near(105.0, $quarterlyAnchors['F2']['low'], 0.000001, 'Quarterly F2 low mismatch');
fib_test_assert_near(320.0, $quarterlyAnchors['F3']['high'], 0.000001, 'Quarterly F3 high mismatch');
fib_test_assert_near(95.0, $quarterlyAnchors['F3']['low'], 0.000001, 'Quarterly F3 low mismatch');

$yearlyCandles = array(
    fib_test_make_candle('2022-06-15 12:00:00 UTC', 500, 200),
    fib_test_make_candle('2022-11-15 12:00:00 UTC', 520, 190),
    fib_test_make_candle('2023-06-15 12:00:00 UTC', 540, 210),
    fib_test_make_candle('2023-11-15 12:00:00 UTC', 560, 205),
    fib_test_make_candle('2024-06-15 12:00:00 UTC', 580, 220),
    fib_test_make_candle('2024-11-15 12:00:00 UTC', 600, 215),
    fib_test_make_candle('2025-06-15 12:00:00 UTC', 620, 230),
);
$yearlyAnchors = $service->resolve_session_anchors($yearlyCandles, 604800);
fib_test_assert_near(600.0, $yearlyAnchors['F1']['high'], 0.000001, 'Yearly F1 high mismatch');
fib_test_assert_near(215.0, $yearlyAnchors['F1']['low'], 0.000001, 'Yearly F1 low mismatch');
fib_test_assert_near(560.0, $yearlyAnchors['F2']['high'], 0.000001, 'Yearly F2 high mismatch');
fib_test_assert_near(205.0, $yearlyAnchors['F2']['low'], 0.000001, 'Yearly F2 low mismatch');
fib_test_assert_near(520.0, $yearlyAnchors['F3']['high'], 0.000001, 'Yearly F3 high mismatch');
fib_test_assert_near(190.0, $yearlyAnchors['F3']['low'], 0.000001, 'Yearly F3 low mismatch');

$twoSessionAnchors = $service->resolve_session_anchors(array(
    fib_test_make_candle('2026-05-11 09:00:00 UTC', 1.20, 0.90),
    fib_test_make_candle('2026-05-12 09:00:00 UTC', 1.30, 0.80),
    fib_test_make_candle('2026-05-13 09:00:00 UTC', 1.40, 0.70),
), 900);
fib_test_assert_same(true, $twoSessionAnchors['F1']['valid'], 'Two-session F1 should be valid');
fib_test_assert_same(true, $twoSessionAnchors['F2']['valid'], 'Two-session F2 should be valid');
fib_test_assert_same(false, $twoSessionAnchors['F3']['valid'], 'Two-session F3 should be invalid');

$oneSessionAnchors = $service->resolve_session_anchors(array(
    fib_test_make_candle('2026-05-12 09:00:00 UTC', 1.30, 0.80),
    fib_test_make_candle('2026-05-13 09:00:00 UTC', 1.40, 0.70),
), 900);
fib_test_assert_same(true, $oneSessionAnchors['F1']['valid'], 'One-session F1 should be valid');
fib_test_assert_same(false, $oneSessionAnchors['F2']['valid'], 'One-session F2 should be invalid');
fib_test_assert_same(false, $oneSessionAnchors['F3']['valid'], 'One-session F3 should be invalid');

$zeroSessionAnchors = $service->resolve_session_anchors(array(
    fib_test_make_candle('2026-05-13 09:00:00 UTC', 1.40, 0.70),
), 900);
fib_test_assert_same(false, $zeroSessionAnchors['F1']['valid'], 'Zero-session F1 should be invalid');
fib_test_assert_same(false, $zeroSessionAnchors['F2']['valid'], 'Zero-session F2 should be invalid');
fib_test_assert_same(false, $zeroSessionAnchors['F3']['valid'], 'Zero-session F3 should be invalid');

fwrite(STDOUT, 'session anchor parity checks passed' . PHP_EOL);
