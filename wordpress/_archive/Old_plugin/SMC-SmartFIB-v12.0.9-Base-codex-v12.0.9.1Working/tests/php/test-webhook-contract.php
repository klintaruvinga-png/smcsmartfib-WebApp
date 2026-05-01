<?php

declare(strict_types=1);

define( 'ABSPATH', __DIR__ );
define( 'HOUR_IN_SECONDS', 3600 );

$repoRoot = dirname(__DIR__, 2);
$optionStore = [
	'sniper_regimes'      => [],
	'sniper_regimes_meta' => [],
	'sniper_live_signals' => [],
	'sniper_ladders'      => [],
	'sniper_ef_levels'    => [],
	'sniper_webhook_log_enabled' => false,
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

function fail($message) {
	fwrite(STDERR, $message . PHP_EOL);
	exit(1);
}

function assertSameValue($actual, $expected, $label) {
	if ($actual !== $expected) {
		fail($label . ' expected ' . var_export($expected, true) . ' got ' . var_export($actual, true));
	}
}

function assertCloseValue($actual, $expected, $label, $epsilon = 0.000001) {
	if (abs(((float) $actual) - ((float) $expected)) > $epsilon) {
		fail($label . ' expected ' . var_export($expected, true) . ' got ' . var_export($actual, true));
	}
}

function plugin_dir_path($file) { return dirname($file) . DIRECTORY_SEPARATOR; }
function plugin_dir_url($file) { return 'https://example.test/plugin/'; }
function add_action($hook, $callback, $priority = 10, $accepted_args = 1) { return true; }
function register_activation_hook($file, $callback) { return true; }
function add_shortcode($tag, $callback) { return true; }
function register_rest_route($namespace, $route, $args) { return true; }
function remove_filter($tag, $callback = null, $priority = 10) { return true; }
function add_filter($tag, $callback, $priority = 10, $accepted_args = 1) { return true; }
function __return_true() { return true; }
function is_admin() { return false; }
function wp_enqueue_style() { return true; }
function esc_url($value) { return (string) $value; }
function esc_html($value) { return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'); }
function esc_attr($value) { return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'); }
function sanitize_text_field($value) { return trim((string) $value); }
function wp_json_encode($value) { return json_encode($value); }
function is_wp_error($value) { return false; }
function rest_ensure_response($response) { return $response; }
function current_time($type) { return gmdate('c'); }
function get_current_user_id() { return 1; }
function get_option($key, $default = false) {
	global $optionStore;
	return array_key_exists($key, $optionStore) ? $optionStore[$key] : $default;
}
function update_option($key, $value, $autoload = null) {
	global $optionStore;
	$optionStore[$key] = $value;
	return true;
}
function get_transient($key) { return false; }
function set_transient($key, $value, $expiration = 0) { return true; }
function delete_transient($key) { return true; }
function get_user_meta($userId, $key, $single = true) { return null; }
function update_user_meta($userId, $key, $value) { return true; }
function wp_validate_auth_cookie($cookie = '', $scheme = '') { return 1; }
function get_user_by($field, $value) { return (object) [ 'display_name' => 'Test User', 'user_email' => 'test@example.test' ]; }
function wp_logout_url($url = '') { return 'https://example.test/logout'; }
function home_url($path = '') { return 'https://example.test' . $path; }
function wp_create_nonce($action = '') { return 'nonce'; }
function wp_get_referer() { return ''; }
function wp_redirect($url) { return true; }
function exit_safe() { return true; }

require_once $repoRoot . DIRECTORY_SEPARATOR . 'sniper-webhook.php';

assertSameValue(sniper_is_supported_signal_schema_version('12.0.9.1') ? true : false, true, 'four-part schema accepted');
assertSameValue(sniper_is_supported_signal_schema_version('12.0.9') ? true : false, true, 'three-part schema accepted');
assertSameValue(sniper_is_supported_signal_schema_version('13.0.0') ? true : false, false, 'unsupported major rejected');
assertSameValue(sniper_normalize_signal_state('EXPIRED'), 'EXPIRED', 'EXPIRED state preserved');
assertSameValue(sniper_watchlist_authorized_symbol('BINANCE:ETHUSDT', [ 'ETHUSD' => true ]), true, 'ETHUSDT authorized by ETH/USD watchlist');
assertSameValue(sniper_watchlist_authorized_symbol('BINANCE:BTCUSDT', [ 'BTCUSD' => true ]), true, 'BTCUSDT authorized by BTC/USD watchlist');
assertSameValue(sniper_watchlist_authorized_symbol('BINANCE:SOLUSDT', [ 'ETHUSD' => true ]), false, 'unwatched crypto remains forbidden');

$now = gmdate('c');

$batchResponse = sniper_receive_engine_batch(new WP_REST_Request([
	'source' => 'js_engine',
	'candle_interval' => '4h',
	'fib_timeframe' => 'WEEKLY',
	'timestamp' => $now,
	'signal_schema_version' => '12.0.9.1',
	'pairs' => [
		'GBPUSD' => [
			'regime' => 'TREND UP',
			'market_price' => 1.2501,
			'sequence_status' => 'READY',
			'signal_state' => 'EXPIRED',
			'f1_high' => 1.31,
			'f1_low' => 1.25,
			'f2_high' => 1.29,
			'f2_low' => 1.24,
			'f3_high' => 1.28,
			'f3_low' => 1.23,
			'gate' => 'NONE',
			'gate_reason' => 'IN_CHOP_BAND',
			'blockers' => [ 'IN_CHOP_BAND' ],
		],
	],
]));

assertSameValue($batchResponse->get_status(), 200, 'engine batch accepts current schema');
$meta = get_option('sniper_regimes_meta', []);
assertCloseValue($meta['GBPUSD']['f1_high'], 1.31, 'engine batch f1 high');
assertCloseValue($meta['GBPUSD']['f2_low'], 1.24, 'engine batch f2 low');
assertCloseValue($meta['GBPUSD']['anchors']['f3']['low'], 1.23, 'engine batch f3 anchor low');
$live = get_option('sniper_live_signals', []);
assertSameValue($live['GBPUSD']['signal_state'], 'EXPIRED', 'live signal EXPIRED state');
assertCloseValue($live['GBPUSD']['f2_high'], 1.29, 'live signal f2 high');

$barOpenTimestamp = gmdate('c', time() - (4 * HOUR_IN_SECONDS) - 5);
$staleBatchResponse = sniper_receive_engine_batch(new WP_REST_Request([
	'source' => 'js_engine',
	'candle_interval' => '4h',
	'fib_timeframe' => 'WEEKLY',
	'timestamp' => $barOpenTimestamp,
	'signal_schema_version' => '12.0.9.1',
	'pairs' => [
		'USDJPY' => [
			'regime' => 'TREND DOWN',
			'market_price' => 155.25,
		],
	],
]));
assertSameValue($staleBatchResponse->get_status(), 422, 'engine batch keeps four-hour freshness cap');

$stalePairResponse = sniper_receive_engine_batch(new WP_REST_Request([
	'source' => 'js_engine',
	'candle_interval' => '4h',
	'fib_timeframe' => 'WEEKLY',
	'timestamp' => $now,
	'signal_schema_version' => '12.0.9.1',
	'pairs' => [
		'EURUSD' => [
			'regime' => 'TREND UP',
			'market_price' => 1.091,
			'updated_at' => gmdate('c', time() - (4 * HOUR_IN_SECONDS) - 5),
		],
	],
]));
$stalePairData = $stalePairResponse->get_data();
assertSameValue($stalePairResponse->get_status(), 200, 'engine batch accepts mixed envelope with stale pair row');
assertSameValue($stalePairData['updated'], 0, 'stale pair row is not stored');
assertSameValue($stalePairData['skipped_stale'], 1, 'stale pair row is reported');
$meta = get_option('sniper_regimes_meta', []);
assertSameValue(isset($meta['EURUSD']), false, 'stale pair row does not create regime meta');

$directBarOpenResponse = sniper_receive_regime_core(new WP_REST_Request([
	'instrument_id' => 'USDJPY',
	'symbol' => 'USDJPY',
	'pair' => 'USD/JPY',
	'regime' => 'TREND DOWN',
	'timeframe' => '240',
	'timestamp' => $barOpenTimestamp,
	'f3_high' => 156.0,
	'f3_low' => 155.0,
]));
assertSameValue($directBarOpenResponse->get_status(), 200, 'direct Pine 4h bar-open timestamp accepted');

$regimeResponse = sniper_receive_regime_core(new WP_REST_Request([
	'instrument_id' => 'GBPUSD',
	'symbol' => 'GBPUSD',
	'pair' => 'GBP/USD',
	'regime' => 'TREND UP',
	'timeframe' => '240',
	'session_tf' => 'Weekly',
	'fib_timeframe' => 'Weekly',
	'timestamp' => $now,
	'f1_high' => 1.41,
	'f1_low' => 1.35,
	'f2_high' => 1.39,
	'f2_low' => 1.34,
	'f3_high' => 1.38,
	'f3_low' => 1.33,
]));

assertSameValue($regimeResponse->get_status(), 200, 'regime webhook status');
$meta = get_option('sniper_regimes_meta', []);
assertCloseValue($meta['GBPUSD']['anchors']['f1']['high'], 1.41, 'regime stores f1 anchor');
assertCloseValue($meta['GBPUSD']['anchors']['f2']['low'], 1.34, 'regime stores f2 anchor');
$authorityPayload = sniper_build_anchor_authority_payload($meta['GBPUSD']['anchors'], $meta['GBPUSD']['updated_at']);
assertSameValue($authorityPayload['source'], 'local_fib_composite', 'averaged fib authority is not labelled as Pine HTF authority');

$meta['GBPUSD']['updated_at'] = '2024-01-01T00:00:00+00:00';
update_option('sniper_regimes_meta', $meta);
$priceResponse = sniper_receive_prices(new WP_REST_Request([ 'GBPUSD' => 1.2468 ]));
assertSameValue($priceResponse->get_status(), 200, 'price endpoint status');
$meta = get_option('sniper_regimes_meta', []);
assertSameValue($meta['GBPUSD']['updated_at'], '2024-01-01T00:00:00+00:00', 'price-only update does not refresh regime timestamp');
assertCloseValue($meta['GBPUSD']['price'], 1.2468, 'price-only update stores price');
assertSameValue(isset($meta['GBPUSD']['price_updated_at']), true, 'price-only update stores separate price timestamp');

$ladderResponse = sniper_store_new_ladder([
	'instrument_id' => 'GBPUSD',
	'symbol' => 'GBPUSD',
	'pair' => 'GBP/USD',
	'ladder_id' => 'GBPUSD-TEST',
	'direction' => 'BUY',
	'entries' => [
		[ 'level' => 'Shallow', 'price' => 1.25, 'status' => 'PENDING' ],
		[ 'level' => 'Mid', 'price' => 1.245, 'status' => 'PENDING' ],
		[ 'level' => 'Deep', 'price' => 1.24, 'status' => 'PENDING' ],
	],
	'sl' => 1.235,
	'tp' => 1.28,
	'confluence_score' => 4,
	'timestamp' => $now,
	'sequence_status' => 'READY',
	'signal_state' => 'ACTIVE',
	'regime' => 'TREND UP',
	'session_tf' => 'Weekly',
	'f1_high' => 1.51,
	'f1_low' => 1.45,
	'f2_high' => 1.49,
	'f2_low' => 1.44,
	'f3_high' => 1.48,
	'f3_low' => 1.43,
]);

assertSameValue($ladderResponse->get_status(), 200, 'new ladder webhook status');
$meta = get_option('sniper_regimes_meta', []);
assertCloseValue($meta['GBPUSD']['anchors']['f1']['high'], 1.51, 'new ladder stores f1 anchor');
assertCloseValue($meta['GBPUSD']['anchors']['f2']['low'], 1.44, 'new ladder stores f2 anchor');
$ladders = get_option('sniper_ladders', []);
assertCloseValue($ladders[0]['anchors']['f3']['high'], 1.48, 'ladder row stores f3 anchor');

echo "PHP webhook contract tests passed" . PHP_EOL;
