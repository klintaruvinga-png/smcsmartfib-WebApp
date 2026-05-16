<?php

define('ABSPATH', __DIR__ . '/');
define('ARRAY_A', 'ARRAY_A');

$GLOBALS['test_transients'] = array();

if (!class_exists('TestWpdb')) {
    class TestWpdb {
        public $prefix = 'wp_';
        public $tables = array();

        public function replace($table, $data, $formats = array()) {
            if (!isset($this->tables[$table])) {
                $this->tables[$table] = array();
            }
            $key = $this->row_key($table, $data);
            $this->tables[$table][$key] = $data;
            return 1;
        }

        public function get_row($query, $output = ARRAY_A) {
            if (preg_match("/SELECT \\* FROM ([^ ]+) WHERE user_id = (\\d+) AND symbol = '([^']+)' AND source = '([^']+)' ORDER BY updated_at DESC LIMIT 1/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $source = $m[4];
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) === $user_id && ($row['symbol'] ?? '') === $symbol && ($row['source'] ?? '') === $source) {
                        return $row;
                    }
                }
            }
            return null;
        }

        public function get_results($query, $output = ARRAY_A) {
            return array();
        }

        public function get_var($query) {
            if (preg_match("/SELECT COUNT\\(\\*\\) FROM ([^ ]+) WHERE user_id = (\\d+) AND symbol = '([^']+)' AND source = 'mt5'/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $count = 0;
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) === $user_id && ($row['symbol'] ?? '') === $symbol && ($row['source'] ?? '') === 'mt5') {
                        $count++;
                    }
                }
                return $count;
            }

            if (preg_match("/SELECT COUNT\\(\\*\\) FROM ([^ ]+) WHERE user_id = (\\d+) AND symbol = '([^']+)' AND \\(source = 'twelve-data' OR source IS NULL OR source = ''\\)/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $count = 0;
                foreach ($this->tables[$table] ?? array() as $row) {
                    $source = $row['source'] ?? '';
                    if ((int) ($row['user_id'] ?? 0) === $user_id && ($row['symbol'] ?? '') === $symbol && ($source === 'twelve-data' || $source === '')) {
                        $count++;
                    }
                }
                return $count;
            }

            return null;
        }

        public function prepare($query, ...$args) {
            if (count($args) === 1 && is_array($args[0])) {
                $args = $args[0];
            }
            $out = '';
            $parts = preg_split('/(%(?:\d+\$)?[dfs])/', $query, -1, PREG_SPLIT_DELIM_CAPTURE);
            $arg_index = 0;
            foreach ($parts as $part) {
                if (preg_match('/^%(?:\d+\$)?([dfs])$/', $part, $matches)) {
                    $value = array_key_exists($arg_index, $args) ? $args[$arg_index++] : null;
                    switch ($matches[1]) {
                        case 'd':
                            $out .= (string) (int) $value;
                            break;
                        case 'f':
                            $out .= (string) (float) $value;
                            break;
                        default:
                            $out .= "'" . str_replace("'", "''", (string) $value) . "'";
                            break;
                    }
                } else {
                    $out .= $part;
                }
            }
            return $out;
        }

        private function row_key($table, $data) {
            if (substr($table, -9) === 'snapshots') {
                return $data['user_id'] . '|' . $data['symbol'];
            }
            if (substr($table, -7) === 'candles') {
                return $data['user_id'] . '|' . $data['symbol'] . '|' . $data['timeframe'] . '|' . $data['candle_time'];
            }
            return uniqid('row_', true);
        }
    }
}

if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($value) {
        return trim((string) $value);
    }
}
if (!function_exists('set_transient')) {
    function set_transient($key, $value, $expiration) {
        $GLOBALS['test_transients'][$key] = $value;
        return true;
    }
}
if (!function_exists('get_transient')) {
    function get_transient($key) {
        return $GLOBALS['test_transients'][$key] ?? false;
    }
}

global $wpdb;
$wpdb = new TestWpdb();

require_once dirname(__DIR__, 2) . '/class-market-data-service.php';

function fail($message) {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function assert_true($condition, $message) {
    if (!$condition) {
        fail($message);
    }
}

function assert_same($expected, $actual, $message) {
    if ($expected !== $actual) {
        fail($message . ' expected=' . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

$service = new SMC_MarketData_Service();
$snapshotTable = $wpdb->prefix . 'smc_sf_snapshots';
$candleTable = $wpdb->prefix . 'smc_sf_candles';

$wpdb->tables[$snapshotTable] = array(
    array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'bid' => 1.1010,
        'ask' => 1.1012,
        'mid' => 1.1011,
        'spread' => 2,
        'source' => 'legacy_ea',
        'state' => 'live',
        'updated_at' => '2026-05-12 08:00:00',
    ),
);

$legacySnapshot = $service->get_price_snapshot(7, 'EURUSD');
assert_same(null, $legacySnapshot, 'Market data service must exclude non-MT5 snapshot rows from price reads');
$legacyAuthority = $service->get_authority_state(7, 'EURUSD');
assert_same('unavailable', $legacyAuthority['authority'], 'Market data service must not treat a non-MT5 snapshot row as MT5 authority');
assert_same(null, $legacyAuthority['price'], 'Market data service must not surface a non-MT5 snapshot row as a live price');

$wpdb->tables[$snapshotTable] = array(
    array(
        'user_id' => 7,
        'symbol' => 'GBPUSD',
        'bid' => 1.2500,
        'ask' => 1.2502,
        'mid' => 1.2501,
        'spread' => 2,
        'source' => 'mt5',
        'state' => 'live',
        'updated_at' => '2026-05-12 08:05:00',
    ),
);
set_transient('smc_sf_freshness_7_GBPUSD', 'LIVE', 300);
set_transient('smc_sf_session_7_GBPUSD', 'London', 300);

$mt5Snapshot = $service->get_price_snapshot(7, 'GBPUSD');
assert_true(is_array($mt5Snapshot), 'Market data service must return MT5 snapshot rows');
assert_same('2026-05-12T08:05:00+00:00', $mt5Snapshot['updated_at'], 'Market data service must preserve MT5 snapshot timestamps when mapping to ISO output');
$mt5Authority = $service->get_authority_state(7, 'GBPUSD');
assert_same('unavailable', $mt5Authority['authority'], 'Authority state should remain unavailable without MT5 candle history even when an MT5 snapshot exists');
assert_true(is_array($mt5Authority['price']), 'Authority state should still surface the MT5 snapshot after source filtering');

assert_true(
    $service->store_tick_snapshot(7, 'EURUSD', array(
        'bid' => 1.1010,
        'ask' => 1.1012,
        'spread' => 2,
        'timestamp' => '2026-05-16T08:15:30Z',
    )),
    'store_tick_snapshot should accept MT5 tick payloads'
);
$storedTick = $wpdb->tables[$snapshotTable]['7|EURUSD'] ?? null;
assert_true(is_array($storedTick), 'store_tick_snapshot must persist the MT5 snapshot row');
assert_same('2026-05-16 08:15:30', $storedTick['updated_at'] ?? null, 'store_tick_snapshot must persist the MT5 quote timestamp instead of server receipt time');

assert_true(
    $service->store_candle_m1(7, 'EURUSD', array(
        'timestamp' => '2026.05.16 08:15:00',
        'open' => 1.1005,
        'high' => 1.1015,
        'low' => 1.1001,
        'close' => 1.1011,
        'volume' => 12,
    )),
    'store_candle_m1 should accept MT5 candle payloads'
);
$storedCandle = $wpdb->tables[$candleTable]['7|EURUSD|1min|2026-05-16 08:15:00'] ?? null;
assert_true(is_array($storedCandle), 'store_candle_m1 must persist the canonical M1 candle row');
assert_same('2026-05-16 08:15:00', $storedCandle['candle_time'] ?? null, 'store_candle_m1 must normalize MT5 candle timestamps to UTC MySQL format');

fwrite(STDOUT, 'market data service source filter checks passed' . PHP_EOL);
