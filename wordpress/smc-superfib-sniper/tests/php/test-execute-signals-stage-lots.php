<?php

require_once __DIR__ . '/fib-test-helpers.php';

function stage_order_id($signal_id, $stage) {
    return 'ord-' . substr(md5($signal_id . '|' . $stage), 0, 16);
}

fib_test_reset_env(77);

$ready_signal = array(
    'id' => 'sig-ready',
    'user_id' => 77,
    'symbol' => 'GBPUSD',
    'direction' => 'LONG',
    'status' => 'READY',
    'backend_confirmed' => 1,
);
$unconfirmed_signal = array(
    'id' => 'sig-unconfirmed',
    'user_id' => 77,
    'symbol' => 'GBPUSD',
    'direction' => 'LONG',
    'status' => 'READY',
    'backend_confirmed' => 0,
);
$not_ready_signal = array(
    'id' => 'sig-armed',
    'user_id' => 77,
    'symbol' => 'GBPUSD',
    'direction' => 'LONG',
    'status' => 'ARMED',
    'backend_confirmed' => 1,
);
$mixed_signal = array(
    'id' => 'sig-mixed',
    'user_id' => 77,
    'symbol' => 'GBPUSD',
    'direction' => 'LONG',
    'status' => 'READY',
    'backend_confirmed' => 1,
);
$all_zero_signal = array(
    'id' => 'sig-all-zero',
    'user_id' => 77,
    'symbol' => 'GBPUSD',
    'direction' => 'LONG',
    'status' => 'READY',
    'backend_confirmed' => 1,
);
$crypto_signal = array(
    'id' => 'sig-crypto',
    'user_id' => 77,
    'symbol' => 'BTCUSD',
    'direction' => 'LONG',
    'status' => 'READY',
    'backend_confirmed' => 1,
);

fib_test_seed_row('signals', $ready_signal);
fib_test_seed_row('signals', $unconfirmed_signal);
fib_test_seed_row('signals', $not_ready_signal);
fib_test_seed_row('signals', $mixed_signal);
fib_test_seed_row('signals', $all_zero_signal);
fib_test_seed_row('signals', $crypto_signal);

$plan = array(
    'entries' => array('e1' => 1.2505, 'e2' => 1.248, 'e3' => 1.2455),
    'lotSize' => array('e1' => 0.11, 'e2' => 0.27, 'e3' => 0.43),
    'stops' => array('e1' => 1.241, 'e2' => 1.2385, 'e3' => 1.236),
    'sl' => 1.2395,
    'tps' => array('tp1' => 1.258, 'tp2' => 1.2625, 'tp3' => 1.269),
);

fib_test_seed_row('trade_plans', array(
    'signal_id' => 'sig-ready',
    'user_id' => 77,
    'plan' => wp_json_encode($plan),
));
fib_test_seed_row('trade_plans', array(
    'signal_id' => 'sig-unconfirmed',
    'user_id' => 77,
    'plan' => wp_json_encode($plan),
));
fib_test_seed_row('trade_plans', array(
    'signal_id' => 'sig-armed',
    'user_id' => 77,
    'plan' => wp_json_encode($plan),
));
fib_test_seed_row('trade_plans', array(
    'signal_id' => 'sig-mixed',
    'user_id' => 77,
    'plan' => wp_json_encode(array(
        'entries' => array('e1' => 1.2405, 'e2' => 1.239, 'e3' => 1.2375),
        'lotSize' => array('e1' => 0.0, 'e2' => 0.12, 'e3' => 0.009),
        'stops' => array('e1' => 1.231, 'e2' => 1.2295, 'e3' => 1.228),
        'sl' => 1.2305,
        'tps' => array('tp1' => 1.248, 'tp2' => 1.2525, 'tp3' => 1.259),
    )),
));
fib_test_seed_row('trade_plans', array(
    'signal_id' => 'sig-all-zero',
    'user_id' => 77,
    'plan' => wp_json_encode(array(
        'entries' => array('e1' => 1.2355, 'e2' => 1.234, 'e3' => 1.2325),
        'lotSize' => array('e1' => 0.0, 'e2' => 0.009, 'e3' => 0.0),
        'stops' => array('e1' => 1.226, 'e2' => 1.2245, 'e3' => 1.223),
        'sl' => 1.2255,
        'tps' => array('tp1' => 1.243, 'tp2' => 1.2475, 'tp3' => 1.254),
    )),
));
fib_test_seed_row('trade_plans', array(
    'signal_id' => 'sig-crypto',
    'user_id' => 77,
    'plan' => wp_json_encode(array(
        'entries' => array('e1' => 68100.0, 'e2' => 67950.0, 'e3' => 67800.0),
        'lotSize' => array('e1' => 0.01, 'e2' => 0.10, 'e3' => 0.09),
        'stops' => array('e1' => 67500.0, 'e2' => 67400.0, 'e3' => 67300.0),
        'sl' => 67400.0,
        'tps' => array('tp1' => 68600.0, 'tp2' => 68900.0, 'tp3' => 69200.0),
    )),
));

$instance = fib_test_make_rest_instance();
$response = $instance->post_execute_signals(new WP_REST_Request(array(
    'signalIds' => array('sig-ready', 'sig-unconfirmed', 'sig-armed', 'sig-mixed', 'sig-all-zero', 'sig-crypto'),
)));
$data = fib_test_response_data($response);

fib_test_assert_same(true, $data['ok'], 'Execute signals response should report success');
fib_test_assert_same(5, $data['queued'], 'Only executable READY/backend-confirmed stages should be queued');

$queued_rows = fib_test_table_rows('trade_queue');
fib_test_assert_same(5, count($queued_rows), 'Only executable READY/backend-confirmed stages should persist queue rows');

$expected_stage_map = array(
    'e1' => array('lots' => 0.11, 'tp' => 1.258, 'sl' => 1.241),
    'e2' => array('lots' => 0.27, 'tp' => 1.2625, 'sl' => 1.2385),
    'e3' => array('lots' => 0.43, 'tp' => 1.269, 'sl' => 1.236),
);

foreach ($expected_stage_map as $stage => $expected) {
    $order_id = stage_order_id('sig-ready', $stage);
    $matching_row = null;
    foreach ($queued_rows as $row) {
        if (($row['id'] ?? null) === $order_id) {
            $matching_row = $row;
            break;
        }
    }

    fib_test_assert_true(is_array($matching_row), 'Missing queue row for stage ' . $stage);
    fib_test_assert_same('sig-ready', $matching_row['signal_id'], 'Queue row signal id should remain deterministic for ' . $stage);

    $payload = json_decode($matching_row['payload'], true);
    fib_test_assert_same($order_id, $payload['id'], 'Order id should be deterministic for ' . $stage);
    fib_test_assert_near($plan['entries'][$stage], $payload['price'], 0.000001, 'Entry price mismatch for ' . $stage);
    fib_test_assert_near($expected['lots'], $payload['lots'], 0.000001, 'Lot size mismatch for ' . $stage);
    fib_test_assert_near($expected['sl'], $payload['sl'], 0.000001, 'Stage stop mismatch for ' . $stage);
    fib_test_assert_near($expected['tp'], $payload['tp'], 0.000001, 'TP mapping mismatch for ' . $stage);
}

$mixed_order_id = stage_order_id('sig-mixed', 'e2');
$mixed_row = null;
foreach ($queued_rows as $row) {
    if (($row['id'] ?? null) === $mixed_order_id) {
        $mixed_row = $row;
        break;
    }
}

fib_test_assert_true(is_array($mixed_row), 'Mixed-lot signal should queue the one executable stage');
$mixed_payload = json_decode($mixed_row['payload'], true);
fib_test_assert_near(0.12, $mixed_payload['lots'], 0.000001, 'Mixed-lot stage should keep the executable stage lot size');

$crypto_order_id = stage_order_id('sig-crypto', 'e2');
$crypto_row = null;
foreach ($queued_rows as $row) {
    if (($row['id'] ?? null) === $crypto_order_id) {
        $crypto_row = $row;
        break;
    }
}

fib_test_assert_true(is_array($crypto_row), 'Crypto signal should queue only the 0.10 lot stage');
$crypto_payload = json_decode($crypto_row['payload'], true);
fib_test_assert_near(0.10, $crypto_payload['lots'], 0.000001, 'Crypto executable stage should preserve the 0.10 lot size');

foreach (array(
    stage_order_id('sig-mixed', 'e1'),
    stage_order_id('sig-mixed', 'e3'),
    stage_order_id('sig-all-zero', 'e1'),
    stage_order_id('sig-all-zero', 'e2'),
    stage_order_id('sig-all-zero', 'e3'),
    stage_order_id('sig-crypto', 'e1'),
    stage_order_id('sig-crypto', 'e3'),
) as $unexpected_order_id) {
    $unexpected_row = array_values(array_filter($queued_rows, function ($row) use ($unexpected_order_id) {
        return ($row['id'] ?? null) === $unexpected_order_id;
    }));
    fib_test_assert_same(0, count($unexpected_row), 'Sub-minimum lot stages must not be queued: ' . $unexpected_order_id);
}

$audit_rows = fib_test_table_rows('audit_events');
$rejections = array_values(array_filter($audit_rows, function ($row) {
    return ($row['event_type'] ?? '') === 'signals.execute.rejected';
}));
fib_test_assert_same(2, count($rejections), 'Unconfirmed and non-READY signals should still be rejected by backend authority gates');

fwrite(STDOUT, 'execute-signals staged lot regression checks passed' . PHP_EOL);
