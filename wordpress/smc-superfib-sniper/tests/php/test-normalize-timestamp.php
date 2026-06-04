<?php

require_once __DIR__ . '/fib-test-helpers.php';

$service = fib_test_make_service_instance(SMC_MarketData_Service::class);

// -----------------------------------------------------------------------
// MODE: $round_to_minute = true  (candle bar-open timestamps)
// -----------------------------------------------------------------------

// Case 1: 11:44:59 → round UP to 11:45:00 (not floor to 11:44:00)
$result = fib_test_invoke_private_method($service, 'normalize_market_timestamp', array('2026-06-04T11:44:59Z', null, true));
fib_test_assert_same('2026-06-04 11:45:00', $result, 'Candle round: 11:44:59 should round to 11:45:00');

// Case 2: 11:45:01 → round DOWN to 11:45:00
$result = fib_test_invoke_private_method($service, 'normalize_market_timestamp', array('2026-06-04T11:45:01Z', null, true));
fib_test_assert_same('2026-06-04 11:45:00', $result, 'Candle round: 11:45:01 should round to 11:45:00');

// Case 3: 11:30:03 → round DOWN to 11:30:00
$result = fib_test_invoke_private_method($service, 'normalize_market_timestamp', array('2026-06-04T11:30:03Z', null, true));
fib_test_assert_same('2026-06-04 11:30:00', $result, 'Candle round: 11:30:03 should round to 11:30:00');

// Case 4: 11:29:59 → round UP to 11:30:00
$result = fib_test_invoke_private_method($service, 'normalize_market_timestamp', array('2026-06-04T11:29:59Z', null, true));
fib_test_assert_same('2026-06-04 11:30:00', $result, 'Candle round: 11:29:59 should round to 11:30:00');

// Case 5: midnight boundary — 23:59:59 rounds UP to next day 00:00:00 (prevents session flip)
$result = fib_test_invoke_private_method($service, 'normalize_market_timestamp', array('2026-06-03T23:59:59Z', null, true));
fib_test_assert_same('2026-06-04 00:00:00', $result, 'Candle round: 23:59:59 should round to 00:00:00 next day');

// Case 6: exact minute — no rounding needed
$result = fib_test_invoke_private_method($service, 'normalize_market_timestamp', array('2026-06-04T11:45:00Z', null, true));
fib_test_assert_same('2026-06-04 11:45:00', $result, 'Candle round: exact minute should be unchanged');

// Case 7: MT5 dot-date format (broker sends 2026.06.04 11:44:59)
$result = fib_test_invoke_private_method($service, 'normalize_market_timestamp', array('2026.06.04 11:44:59', null, true));
fib_test_assert_same('2026-06-04 11:45:00', $result, 'Candle round: MT5 dot-date 11:44:59 should round to 11:45:00');

// -----------------------------------------------------------------------
// MODE: $round_to_minute = false  (tick snapshot timestamps — default)
// Seconds must be preserved exactly. No rounding, no future-looking writes.
// -----------------------------------------------------------------------

// Case 8: jittered tick — seconds preserved, NOT rounded
$result = fib_test_invoke_private_method($service, 'normalize_market_timestamp', array('2026-06-04T11:44:59Z', null, false));
fib_test_assert_same('2026-06-04 11:44:59', $result, 'Tick: 11:44:59 should preserve seconds (no rounding)');

// Case 9: mid-minute tick — must not round forward to next minute
$result = fib_test_invoke_private_method($service, 'normalize_market_timestamp', array('2026-06-04T11:44:31Z', null, false));
fib_test_assert_same('2026-06-04 11:44:31', $result, 'Tick: 11:44:31 must NOT round to 11:45:00');

// Case 10: default call (2-arg form used by store_tick_snapshot) — treated as false
$result = fib_test_invoke_private_method($service, 'normalize_market_timestamp', array('2026-06-04T11:44:59Z', null));
fib_test_assert_same('2026-06-04 11:44:59', $result, 'Tick default: 2-arg call must preserve seconds');

echo "normalize_market_timestamp rounding checks passed\n";
