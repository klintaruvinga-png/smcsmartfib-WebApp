<?php
/**
 * Tests for SMC_MarketData_Service::get_pine_compatible_fib_levels()
 *
 * Validates:
 *   - H1/H4/D1 outputs are derived from M15 only (no direct timeframe rows needed)
 *   - Every anchor_debug record carries candle_lineage = "derived_from_M15"
 *   - source_period follows the Pine v13.1.3 helper ladder
 *   - Latest M15 window is fetched DESC and restored to ASC before calculation
 *   - Compression threshold matches Pine/EA constants per symbol class
 *   - Aggregate helper feeds keep the latest bucket; only session building drops latest session
 */

require_once __DIR__ . '/fib-test-helpers.php';

$ratios = array(-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300);

// ---- Mock wpdb that returns M15 candles and nothing else ----------------------

/**
 * Build a minimal fake wpdb that serves M15 candle fixtures.
 * Direct H1/H4/D1 rows are intentionally absent to prove derived-from-M15 path.
 */
function pine_test_make_mock_wpdb(array $m15_rows, $prefix = 'wp_') {
    $mock = new class($m15_rows, $prefix) {
        public $prefix;
        public $last_sql = '';
        private $rows;
        public function __construct($rows, $pfx) {
            $this->rows   = $rows;
            $this->prefix = $pfx;
        }
        public function prepare($sql, ...$args) {
            // Simple positional substitution - enough for test assertions.
            $i = 0;
            return preg_replace_callback('/%[sdf]/', function() use (&$i, $args) {
                return addslashes((string) ($args[$i++] ?? ''));
            }, $sql);
        }
        public function get_results($sql, $mode = null) {
            $this->last_sql = $sql;
            // Only serve M15 rows when the timeframe filter matches '15min'.
            if (strpos($sql, "'15min'") !== false || strpos($sql, '15min') !== false) {
                if (preg_match('/ORDER BY candle_time DESC/i', $sql)) {
                    return array_reverse($this->rows);
                }
                return $this->rows;
            }
            return array();
        }
        public function get_var($sql) {
            return null;
        }
    };
    return $mock;
}

/**
 * Build a set of M15 candle rows dense enough to produce completed sessions
 * across Daily, Weekly, Monthly, and Quarterly boundaries.
 *
 * Strategy: 1 bar per 15 min for ~90 days = 8640 bars.
 * We use simplified OHLC (high=bar_idx/100+1, low=bar_idx/100) so anchor
 * values are predictable.
 */
function pine_test_make_dense_m15_rows($symbol = 'EURUSD') {
    // Start 2025-01-06 00:00:00 UTC (Monday, week 2 of 2025)
    $start_ts = strtotime('2025-01-06 00:00:00 UTC');
    $rows = array();
    $bar_count = 8640; // 90 days of 15-min bars

    for ($i = 0; $i < $bar_count; $i++) {
        $ts  = $start_ts + $i * 900;
        $val = 1.1000 + ($i % 100) * 0.001;
        $rows[] = array(
            'candle_time' => gmdate('Y-m-d H:i:s', $ts),
            'open'        => $val,
            'high'        => $val + 0.0005,
            'low'         => $val - 0.0005,
            'close'       => $val + 0.0002,
            'volume'      => 100,
        );
    }

    return $rows;
}

/**
 * Instantiate SMC_MarketData_Service with an injected mock wpdb.
 * Uses reflection to replace private $wpdb and $table_prefix.
 */
function pine_test_make_service_with_mock(array $m15_rows) {
    global $wpdb;

    $mock_wpdb = pine_test_make_mock_wpdb($m15_rows, 'wp_');
    $wpdb = $mock_wpdb;
    $GLOBALS['pine_test_last_wpdb'] = $mock_wpdb;

    $svc = new SMC_MarketData_Service();
    $ref = new ReflectionClass($svc);

    $wpdb_prop = $ref->getProperty('wpdb');
    $wpdb_prop->setAccessible(true);

    $prefix_prop = $ref->getProperty('table_prefix');
    $prefix_prop->setAccessible(true);

    $mock_wpdb->prefix = 'wp_';

    $wpdb_prop->setValue($svc, $mock_wpdb);
    $prefix_prop->setValue($svc, 'wp_smc_sf_');

    return $svc;
}

// ---- Include real service class -----------------------------------------------
require_once __DIR__ . '/../../class-market-data-service.php';

// ---- Tests --------------------------------------------------------------------

$pass = 0;
$fail = 0;

function pine_assert($cond, $msg) {
    global $pass, $fail;
    if ($cond) {
        echo "  PASS: $msg\n";
        $pass++;
    } else {
        echo "  FAIL: $msg\n";
        $fail++;
    }
}

function pine_assert_close($actual, $expected, $msg, $epsilon = 1e-8) {
    pine_assert(abs((float) $actual - (float) $expected) <= $epsilon, $msg . " (got {$actual}, expected {$expected})");
}

$m15_rows = pine_test_make_dense_m15_rows('EURUSD');
$svc      = pine_test_make_service_with_mock($m15_rows);
$ref      = new ReflectionClass($svc);

echo "\n[test-pine-compatible-fib-levels] Running...\n";

// ---- Test 1: returns ok=true and source=pine_compatible -----------------------
echo "\nTest 1: Response shape\n";
$result = $svc->get_pine_compatible_fib_levels(1, 'EURUSD');
pine_assert(!($result instanceof WP_Error), 'result is not WP_Error');
pine_assert(isset($result['ok']) && $result['ok'] === true, 'ok=true');
pine_assert(isset($result['source']) && $result['source'] === 'pine_compatible', 'source=pine_compatible');
pine_assert(isset($result['fibs']), 'fibs key present');
pine_assert(isset($result['anchor_debug']), 'anchor_debug key present');

// ---- Test 2: Latest M15 window is fetched and restored to ascending order -----
echo "\nTest 2: Latest M15 window query and normalization order\n";
pine_assert(
    isset($GLOBALS['pine_test_last_wpdb']->last_sql)
        && preg_match('/ORDER BY candle_time DESC\s+LIMIT 60000/i', $GLOBALS['pine_test_last_wpdb']->last_sql),
    'M15 SQL fetches latest 60000 rows using DESC LIMIT'
);
pine_assert(
    isset($result['anchor_debug']['M15']['LTF_SF']['components'][0]['slot'])
        && $result['anchor_debug']['M15']['LTF_SF']['components'][0]['slot'] === 'F1',
    'DESC query rows are reversed before session calculation'
);

// ---- Test 3: All four chart TFs exist in output (no direct rows required) -----
echo "\nTest 3: All chart timeframes derived from M15\n";
foreach (array('M15', 'H1', 'H4', 'D1') as $tf) {
    pine_assert(isset($result['fibs'][$tf]), "$tf fibs present (derived from M15, no direct rows)");
}

// ---- Test 4: Expected family/timeframe tuples and row counts -------------------
echo "\nTest 4: Expected family/timeframe tuples and row counts\n";
global $ratios;
$expected_tuples = array(
    'M15' => array('LTF_SF', 'HTF_AF'),
    'H1'  => array('LTF_SF', 'HTF_AF'),
    'H4'  => array('LTF_SF', 'HTF_AF'),
    'D1'  => array('LTF_SF'),
);
$expected_level_rows = 0;
$actual_level_rows = 0;
foreach ($expected_tuples as $tf => $families) {
    foreach ($families as $fam) {
        pine_assert(isset($result['fibs'][$tf][$fam]), "$tf/$fam levels present");
        pine_assert(count($result['fibs'][$tf][$fam]) === count($ratios), "$tf/$fam has 16 levels");
        $expected_level_rows += count($ratios);
        $actual_level_rows += isset($result['fibs'][$tf][$fam]) ? count($result['fibs'][$tf][$fam]) : 0;
    }
}
pine_assert(!isset($result['fibs']['D1']['HTF_AF']), 'D1/HTF_AF absent because fixture has no completed prior year');
pine_assert($expected_level_rows === 112, 'Fixture scope expects 112 level rows (7 tuples * 16 ratios)');
pine_assert($actual_level_rows === 112, 'Fixture scope returns 112 level rows (7 tuples * 16 ratios)');

// ---- Test 5: candle_lineage = derived_from_M15 in every expected debug record -
echo "\nTest 5: candle_lineage = derived_from_M15 in all expected anchor_debug records\n";
foreach ($expected_tuples as $tf => $families) {
    foreach ($families as $fam) {
        pine_assert(isset($result['anchor_debug'][$tf][$fam]), "$tf/$fam anchor_debug present");
        $dbg = $result['anchor_debug'][$tf][$fam];
        pine_assert(
            isset($dbg['candle_lineage']) && $dbg['candle_lineage'] === 'derived_from_M15',
            "$tf/$fam candle_lineage=derived_from_M15"
        );
    }
}

// ---- Test 6: source_period follows helper ladder ------------------------------
// Pine v13.1.3 helper ladder:
//   M15 LTF_SF -> M15,  H1 LTF_SF -> H1,  H4 LTF_SF -> D1,  D1 LTF_SF -> D1
//   M15 HTF_AF -> H1,   H1 HTF_AF -> D1,  H4 HTF_AF -> D1,  D1 HTF_AF -> D1
echo "\nTest 6: source_period follows Pine v13.1.3 helper ladder\n";
$expected_source_period = array(
    'M15' => array('LTF_SF' => 'M15', 'HTF_AF' => 'H1'),
    'H1'  => array('LTF_SF' => 'H1',  'HTF_AF' => 'D1'),
    'H4'  => array('LTF_SF' => 'D1',  'HTF_AF' => 'D1'),
    'D1'  => array('LTF_SF' => 'D1',  'HTF_AF' => 'D1'),
);
foreach ($expected_source_period as $tf => $families) {
    foreach ($families as $fam => $expected_sp) {
        if (!in_array($fam, $expected_tuples[$tf], true)) {
            continue;
        }
        $dbg = $result['anchor_debug'][$tf][$fam];
        pine_assert(
            isset($dbg['source_period']) && $dbg['source_period'] === $expected_sp,
            "$tf/$fam source_period=$expected_sp (got " . ($dbg['source_period'] ?? 'null') . ")"
        );
    }
}

// ---- Test 7: Anchor values match deterministic Pine-compatible fixture --------
echo "\nTest 7: Expected deterministic anchor values\n";
foreach ($expected_tuples as $tf => $families) {
    foreach ($families as $fam) {
        $dbg = $result['anchor_debug'][$tf][$fam];
        pine_assert_close($dbg['anchor_high'], 1.1995, "$tf/$fam anchor_high");
        pine_assert_close($dbg['anchor_low'], 1.0995, "$tf/$fam anchor_low");
    }
}
pine_assert((int) $result['anchor_debug']['H4']['LTF_SF']['source_feed_bars'] === 90, 'H4/LTF_SF D1 helper keeps all 90 aggregate buckets');
pine_assert((int) $result['anchor_debug']['H4']['HTF_AF']['source_feed_bars'] === 90, 'H4/HTF_AF D1 helper keeps all 90 aggregate buckets');

// ---- Test 8: Aggregate keeps latest bucket; session builder drops session only -
echo "\nTest 8: Aggregate/session drop parity\n";
$agg_method = $ref->getMethod('pine_aggregate_candles');
$agg_method->setAccessible(true);
$session_method = $ref->getMethod('pine_build_sessions');
$session_method->setAccessible(true);
$month_edge_feed = array(
    array('time' => strtotime('2025-01-31 00:00:00 UTC'), 'open' => 1.1, 'high' => 1.2, 'low' => 1.0, 'close' => 1.15),
    array('time' => strtotime('2025-02-01 00:00:00 UTC'), 'open' => 1.2, 'high' => 1.3, 'low' => 1.1, 'close' => 1.25),
    array('time' => strtotime('2025-03-01 00:00:00 UTC'), 'open' => 1.3, 'high' => 1.4, 'low' => 1.2, 'close' => 1.35),
);
$aggregated_days = $agg_method->invoke($svc, $month_edge_feed, 86400);
$completed_months = $session_method->invoke($svc, $aggregated_days, 'Monthly');
pine_assert(count($aggregated_days) === 3, 'D1 aggregation retains latest bucket');
pine_assert(count($completed_months) === 2, 'Monthly session builder alone drops latest session');

// ---- Test 9: anchor_debug contains required fields ----------------------------
echo "\nTest 9: Required anchor_debug fields present\n";
$required_fields = array('symbol', 'timeframe', 'family', 'candle_lineage', 'source_period',
    'source_feed_bars', 'anchor_high', 'anchor_low', 'anchor_range', 'compression_threshold');
foreach ($expected_tuples as $tf => $families) {
    foreach ($families as $fam) {
        $dbg = $result['anchor_debug'][$tf][$fam];
        foreach ($required_fields as $field) {
            pine_assert(isset($dbg[$field]), "$tf/$fam anchor_debug.$field present");
        }
    }
}

// ---- Test 10: Compression threshold correct per symbol class ------------------
echo "\nTest 10: Compression threshold per symbol class\n";
$thresh_method = $ref->getMethod('pine_compression_threshold');
$thresh_method->setAccessible(true);

$thresh_eur = $thresh_method->invoke($svc, 'EURUSD');
$thresh_jpy = $thresh_method->invoke($svc, 'USDJPY');
$thresh_xau = $thresh_method->invoke($svc, 'XAUUSD');

pine_assert(abs($thresh_eur - 0.0020) < 1e-8, 'EURUSD threshold=0.0020 (20 pips * 0.0001)');
pine_assert(abs($thresh_jpy - 0.40)   < 1e-8, 'USDJPY threshold=0.40 (40 pips * 0.01)');
pine_assert(abs($thresh_xau - 0.20)   < 1e-8, 'XAUUSD threshold=0.20 (20 pips * 0.01)');

// ---- Test 11: Timeframe filter -----------------------------------------------
echo "\nTest 11: Timeframe filter\n";
$filtered = $svc->get_pine_compatible_fib_levels(1, 'EURUSD', 'H1');
pine_assert(!($filtered instanceof WP_Error), 'Filtered result is not WP_Error');
pine_assert(isset($filtered['fibs']['H1']), 'H1 fibs present when filtered to H1');
pine_assert(!isset($filtered['fibs']['M15']), 'M15 fibs absent when filtered to H1');
pine_assert(!isset($filtered['fibs']['H4']),  'H4 fibs absent when filtered to H1');

// ---- Test 12: Missing M15 candles returns WP_Error ---------------------------
echo "\nTest 12: WP_Error on missing M15 candles\n";
$empty_svc = pine_test_make_service_with_mock(array());
$err = $empty_svc->get_pine_compatible_fib_levels(1, 'EURUSD');
pine_assert($err instanceof WP_Error, 'Empty M15 returns WP_Error');

// ---- Summary -----------------------------------------------------------------
echo "\n[test-pine-compatible-fib-levels] Done: $pass passed, $fail failed.\n";
if ($fail > 0) {
    exit(1);
}
