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
            if (preg_match("/SELECT \\* FROM ([^ ]+) WHERE user_id = (\\d+) AND symbol = '([^']+)' AND timeframe = '([^']+)' AND source = '([^']+)' ORDER BY candle_time (ASC|DESC) LIMIT (\\d+)/", $query, $m)) {
                $table = $m[1];
                $user_id = (int) $m[2];
                $symbol = $m[3];
                $timeframe = $m[4];
                $source = $m[5];
                $direction = strtoupper($m[6]);
                $limit = (int) $m[7];
                $rows = array();
                foreach ($this->tables[$table] ?? array() as $row) {
                    if ((int) ($row['user_id'] ?? 0) !== $user_id) {
                        continue;
                    }
                    if (($row['symbol'] ?? '') !== $symbol || ($row['timeframe'] ?? '') !== $timeframe || ($row['source'] ?? '') !== $source) {
                        continue;
                    }
                    $rows[] = $row;
                }
                usort($rows, function ($left, $right) use ($direction) {
                    $cmp = strcmp((string) ($left['candle_time'] ?? ''), (string) ($right['candle_time'] ?? ''));
                    return $direction === 'DESC' ? -1 * $cmp : $cmp;
                });
                return array_slice($rows, 0, $limit);
            }

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
    $service->store_tick_snapshot(7, 'USDJPY', array(
        'bid' => 156.250,
        'ask' => 156.252,
        'spread' => 2,
        'timestamp' => '2026-05-16 08:16:30 UTC',
    )),
    'store_tick_snapshot should accept UTC-suffixed broker timestamps'
);
$storedUtcTick = $wpdb->tables[$snapshotTable]['7|USDJPY'] ?? null;
assert_true(is_array($storedUtcTick), 'store_tick_snapshot must persist UTC-suffixed MT5 tick rows');
assert_same('2026-05-16 08:16:30', $storedUtcTick['updated_at'] ?? null, 'store_tick_snapshot must normalize UTC-suffixed timestamps instead of falling back to receipt time');

assert_true(
    $service->store_tick_snapshot(7, 'BTCUSD', array(
        'bid' => 103250.10,
        'ask' => 103250.90,
        'spread' => 80,
        'timestamp' => '2026-05-23T12:00:00Z',
        'freshness' => 'LIVE',
    )),
    'store_tick_snapshot should keep crypto LIVE payloads writable'
);
$storedCryptoTick = $wpdb->tables[$snapshotTable]['7|BTCUSD'] ?? null;
assert_true(is_array($storedCryptoTick), 'store_tick_snapshot must persist the MT5 crypto snapshot row');
assert_same('live', $storedCryptoTick['state'] ?? null, 'store_tick_snapshot must persist crypto LIVE freshness as a live snapshot state');

assert_same(
    false,
    $service->store_tick_snapshot(7, 'EURUSD', array(
        'bid' => 1.1010,
        'ask' => 1.1012,
        'spread' => 2,
        'timestamp' => 'not-a-market-time',
    )),
    'store_tick_snapshot must reject malformed tick timestamps instead of falling back to server receipt time'
);

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

assert_true(
    $service->store_candle_m1(7, 'USDJPY', array(
        'timestamp' => '2026-05-16 08:16:00 UTC',
        'open' => 156.200,
        'high' => 156.300,
        'low' => 156.150,
        'close' => 156.250,
        'volume' => 8,
    )),
    'store_candle_m1 should accept UTC-suffixed MT5 candle timestamps'
);
$storedUtcCandle = $wpdb->tables[$candleTable]['7|USDJPY|1min|2026-05-16 08:16:00'] ?? null;
assert_true(is_array($storedUtcCandle), 'store_candle_m1 must persist UTC-suffixed MT5 candle rows');
assert_same('2026-05-16 08:16:00', $storedUtcCandle['candle_time'] ?? null, 'store_candle_m1 must normalize UTC-suffixed timestamps instead of falling back to receipt time');

assert_same(
    false,
    $service->store_candle_m1(7, 'EURUSD', array(
        'open' => 1.1005,
        'high' => 1.1015,
        'low' => 1.1001,
        'close' => 1.1011,
        'volume' => 12,
    )),
    'store_candle_m1 must reject missing candle timestamps instead of manufacturing a fresh candle time'
);

assert_same(
    false,
    $service->store_candle_m1(7, 'EURUSD', array(
        'timestamp' => 'not-a-market-time',
        'open' => 1.1005,
        'high' => 1.1015,
        'low' => 1.1001,
        'close' => 1.1011,
        'volume' => 12,
    )),
    'store_candle_m1 must reject malformed candle timestamps instead of falling back to server receipt time'
);

for ($i = 0; $i < 30; $i++) {
    $bucket = $i < 15 ? 0 : 15;
    $minute = $i % 15;
    $timestamp = sprintf('2026-06-03 08:%02d:00', $bucket + $minute);
    $wpdb->replace($candleTable, array(
        'user_id' => 7,
        'symbol' => 'EURUSD',
        'timeframe' => '1min',
        'candle_time' => $timestamp,
        'open' => 1.1000 + ($i * 0.0001),
        'high' => 1.1010 + ($i * 0.0001),
        'low' => 1.0990 - ($i * 0.0001),
        'close' => 1.1005 + ($i * 0.0001),
        'volume' => '2',
        'source' => 'mt5',
        'created_at' => '2026-06-03 08:30:00',
    ));
}
$wpdb->replace($candleTable, array(
    'user_id' => 7,
    'symbol' => 'EURUSD',
    'timeframe' => '1min',
    'candle_time' => '2026-06-03 08:45:00',
    'open' => 9.0,
    'high' => 9.0,
    'low' => 9.0,
    'close' => 9.0,
    'volume' => '999',
    'source' => 'twelve-data',
    'created_at' => '2026-06-03 08:30:00',
));

$phase4Candles = $service->get_phase4_candles(7, 'EURUSD', 'M15', 2);
assert_same(2, count($phase4Candles), 'Phase 4 candle export must aggregate two M15 buckets from MT5 M1 candles');
assert_same('2026-06-03T08:00:00Z', $phase4Candles[0]['time'], 'Phase 4 M15 candle time must be UTC bucket start');
assert_same(1.1, $phase4Candles[0]['open'], 'Phase 4 M15 open must be the first MT5 M1 open');
assert_same(1.1024, $phase4Candles[0]['high'], 'Phase 4 M15 high must be the max MT5 M1 high and exclude TwelveData rows');
assert_same(1.0976, $phase4Candles[0]['low'], 'Phase 4 M15 low must be the min MT5 M1 low and exclude TwelveData rows');
assert_same(1.1019, $phase4Candles[0]['close'], 'Phase 4 M15 close must be the last MT5 M1 close');
assert_same(30, $phase4Candles[0]['volume'], 'Phase 4 M15 volume must sum MT5 M1 volume');
assert_same('2026-06-03T08:15:00Z', $phase4Candles[1]['time'], 'Phase 4 candles must be sorted ascending by UTC bucket start');

fwrite(STDOUT, 'market data service source filter checks passed' . PHP_EOL);
