<?php

declare(strict_types=1);

$repoRoot = dirname(__DIR__, 2);
$fixturePath = $repoRoot . DIRECTORY_SEPARATOR . 'tests' . DIRECTORY_SEPARATOR . 'fixtures' . DIRECTORY_SEPARATOR . 'execution_buy_weekly.json';
$fixture = json_decode(file_get_contents($fixturePath), true);
$stagedFixturePath = $repoRoot . DIRECTORY_SEPARATOR . 'tests' . DIRECTORY_SEPARATOR . 'fixtures' . DIRECTORY_SEPARATOR . 'execution_buy_weekly_ef_staged.json';
$stagedFixture = json_decode(file_get_contents($stagedFixturePath), true);

$metaStore = [
	'sn_act' => [ 'equity' => 5000.0 ],
	'sn_risk_profile' => [ 'risk_pct' => 1.0, 'max_drawdown_pct' => 5.0 ],
	'sn_fib_tf' => 'WEEKLY',
	'sn_trade_queue' => []
];

if ( ! class_exists('WP_REST_Request') ) {
	class WP_REST_Request {
		private $params;
		public function __construct($params = []) { $this->params = $params; }
		public function get_json_params() { return $this->params; }
	}
}

if ( ! class_exists('WP_REST_Response') ) {
	class WP_REST_Response {
		private $data;
		private $status;
		public function __construct($data = [], $status = 200) {
			$this->data = $data;
			$this->status = $status;
		}
		public function get_data() { return $this->data; }
		public function get_status() { return $this->status; }
	}
}

if ( ! function_exists('get_current_user_id') ) {
	function get_current_user_id() { return 1; }
}

if ( ! function_exists('sanitize_text_field') ) {
	function sanitize_text_field($value) {
		return trim((string) $value);
	}
}

if ( ! function_exists('sniper_boolish') ) {
	function sniper_boolish($value) {
		if (is_bool($value)) return $value;
		$text = strtoupper(trim((string) $value));
		return in_array($text, ['1', 'TRUE', 'YES', 'ON'], true);
	}
}

if ( ! function_exists('get_user_meta') ) {
	function get_user_meta($userId, $key, $single = true) {
		global $metaStore;
		return $metaStore[$key] ?? null;
	}
}

if ( ! function_exists('update_user_meta') ) {
	function update_user_meta($userId, $key, $value) {
		global $metaStore;
		$metaStore[$key] = $value;
		return true;
	}
}

if ( ! function_exists('current_time') ) {
	function current_time($type) {
		return '2024-06-04T13:30:00+00:00';
	}
}

if ( ! function_exists('sniper_get_user_meta_value') ) {
	function sniper_get_user_meta_value($userId, $key, $default = null) {
		return get_user_meta($userId, $key, true) ?? $default;
	}
}

if ( ! function_exists('sniper_update_user_meta_value') ) {
	function sniper_update_user_meta_value($userId, $key, $value) {
		return update_user_meta($userId, $key, $value);
	}
}

if ( ! function_exists('sniper_instrument_specs') ) {
	function sniper_instrument_specs() {
		return [
			'GBPUSD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'USD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
			'USDJPY' => [ 'type' => 'forex', 'pip_size' => 0.01, 'contract_size' => 100000, 'quote' => 'JPY', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		];
	}
}

require_once $repoRoot . DIRECTORY_SEPARATOR . 'sniper-execution-engine.php';

function fail($message) {
	fwrite(STDERR, $message . PHP_EOL);
	exit(1);
}

function assertSameValue($actual, $expected, $label) {
	if ($actual !== $expected) {
		fail($label . ' expected ' . var_export($expected, true) . ' got ' . var_export($actual, true));
	}
}

function assertCloseValue($actual, $expected, $label, $epsilon = 0.00001) {
	if (abs(((float) $actual) - ((float) $expected)) > $epsilon) {
		fail($label . ' expected ' . var_export($expected, true) . ' got ' . var_export($actual, true));
	}
}

assertCloseValue(sniper_exe_price_to_pips('GBP/USD', 1.2500, 1.2450), 50.0, 'GBP/USD pip conversion');
assertCloseValue(sniper_exe_price_to_pips('USD/JPY', 151.25, 150.75), 50.0, 'USD/JPY pip conversion');
assertCloseValue(sniper_exe_calc_lot('GBP/USD', 10.0, 50.0), 0.02, 'GBP/USD lot sizing');
assertCloseValue(sniper_exe_calc_lot('USD/JPY', 15.0, 30.0), 0.07, 'USD/JPY lot sizing');

$rb = sniper_exe_risk_breakdown(
	'GBP/USD',
	$fixture['expected']['entries'],
	$fixture['expected']['sl'],
	[
		'balance_usc' => 5000.0,
		'risk_pct' => 0.75,
		'max_drawdown_pct' => 5.0
	],
	0.167035
);

assertSameValue($rb['available'], true, 'risk breakdown available');
assertCloseValue($rb['stages'][0]['lot'], $fixture['expected']['risk']['stageLots'][0], 'risk breakdown E1 lot');
assertCloseValue($rb['stages'][1]['lot'], $fixture['expected']['risk']['stageLots'][1], 'risk breakdown E2 lot');
assertCloseValue($rb['stages'][2]['lot'], $fixture['expected']['risk']['stageLots'][2], 'risk breakdown E3 lot');
assertCloseValue($rb['total_risk_amount'], $fixture['expected']['risk']['totalRiskUsc'], 'risk breakdown total USC');
assertCloseValue($rb['dd_impact_pct'], 0.57, 'risk breakdown dd impact', 0.01);

$request = new WP_REST_Request([
	'signals' => [ $fixture['executionSignal'] ],
	'fib_timeframe' => $fixture['options']['sessionTf'],
	'zar_rate' => 0.167035
]);

$response = sniper_exe_execute_signals($request);
$data = $response->get_data();

assertSameValue($response->get_status(), 200, 'execute_signals status');
assertSameValue($data['count'], 1, 'execute_signals blueprint count');

$blueprint = $data['blueprints'][0];

assertSameValue($blueprint['pair'], $fixture['executionSignal']['pair'], 'blueprint pair');
assertSameValue($blueprint['direction'], $fixture['executionSignal']['direction'], 'blueprint direction');
assertSameValue($blueprint['entries'], $fixture['expected']['entries'], 'blueprint entries');
assertCloseValue($blueprint['sl'], $fixture['expected']['sl'], 'blueprint sl');
assertCloseValue($blueprint['rr1'], $fixture['expected']['rr1'], 'blueprint rr1');
assertCloseValue($blueprint['rr_actual'], $fixture['expected']['rrActual'], 'blueprint rr actual');
assertCloseValue($blueprint['risk_breakdown']['total_risk_amount'], $fixture['expected']['risk']['totalRiskUsc'], 'blueprint total risk USC');

$stagedRequest = new WP_REST_Request([
	'signals' => [ $stagedFixture['executionSignal'] ],
	'fib_timeframe' => $stagedFixture['options']['sessionTf'],
	'zar_rate' => 0.167035
]);

$stagedResponse = sniper_exe_execute_signals($stagedRequest);
$stagedData = $stagedResponse->get_data();

assertSameValue($stagedResponse->get_status(), 200, 'staged execute_signals status');
assertSameValue($stagedData['count'], 1, 'staged execute_signals blueprint count');

$stagedBlueprint = $stagedData['blueprints'][0];

assertSameValue($stagedBlueprint['entry_source'], $stagedFixture['expected']['entrySource'], 'staged blueprint entry source');
assertSameValue($stagedBlueprint['entries'], $stagedFixture['expected']['entries'], 'staged blueprint entries');
assertSameValue($stagedBlueprint['stage_sls'], $stagedFixture['expected']['stageSls'], 'staged blueprint stage sls');
assertCloseValue($stagedBlueprint['sl'], $stagedFixture['expected']['sl'], 'staged blueprint shallow sl');
assertSameValue($stagedBlueprint['sl_rule'], $stagedFixture['expected']['slRule'], 'staged blueprint sl rule');
assertCloseValue($stagedBlueprint['rr1'], $stagedFixture['expected']['rr1'], 'staged blueprint rr1');
assertCloseValue($stagedBlueprint['rr_actual'], $stagedFixture['expected']['rrActual'], 'staged blueprint rr actual');
assertCloseValue($stagedBlueprint['risk_breakdown']['stages'][0]['lot'], $stagedFixture['expected']['risk']['stageLots'][0], 'staged blueprint E1 lot');
assertCloseValue($stagedBlueprint['risk_breakdown']['stages'][1]['lot'], $stagedFixture['expected']['risk']['stageLots'][1], 'staged blueprint E2 lot');
assertCloseValue($stagedBlueprint['risk_breakdown']['stages'][2]['lot'], $stagedFixture['expected']['risk']['stageLots'][2], 'staged blueprint E3 lot');
assertCloseValue($stagedBlueprint['risk_breakdown']['total_risk_amount'], $stagedFixture['expected']['risk']['totalRiskUsc'], 'staged blueprint total risk USC');
assertSameValue($stagedBlueprint['sl_levels'][0]['level_label'], 'EF 75%', 'staged blueprint shallow sl level label');

echo "PHP execution-engine tests passed" . PHP_EOL;
