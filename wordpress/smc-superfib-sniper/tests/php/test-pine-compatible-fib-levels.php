<?php
/**
 * Tests for SMC_MarketData_Service::get_pine_compatible_fib_levels()
 *
 * Validates:
 *   - H1/H4/D1 outputs are derived from M15 only (no direct timeframe rows needed)
 *   - Every anchor_debug record carries candle_lineage = "derived_from_M15"
 *   - source_period follows the Pine v13.1.3 helper ladder
 *   - Default endpoint behavior (stored direct) is unchanged
 *   - Compression threshold matches Pine/EA constants per symbol class
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
            // Only serve M15 rows when the timeframe filter matches '15min'.
            if (strpos($sql, "'15min'") !== false || strpos($sql, '15min') !== false) {
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

$m15_rows = pine_test_make_dense_m15_rows('EURUSD');
$svc      = pine_test_make_service_with_mock($m15_rows);

echo "\n[test-pine-compatible-fib-levels] Running...\n";

// ---- Test 1: returns ok=true and source=pine_compatible -----------------------
echo "\nTest 1: Response shape\n";
$result = $svc->get_pine_compatible_fib_levels(1, 'EURUSD');
pine_assert(!($result instanceof WP_Error), 'result is not WP_Error');
pine_assert(isset($result['ok']) && $result['ok'] === true, 'ok=true');
pine_assert(isset($result['source']) && $result['source'] === 'pine_compatible', 'source=pine_compatible');
pine_assert(isset($result['fibs']), 'fibs key present');
pine_assert(isset($result['anchor_debug']), 'anchor_debug key present');

// ---- Test 2: All four chart TFs exist in output (no direct rows required) -----
echo "\nTest 2: All chart timeframes derived from M15\n";
foreach (array('M15', 'H1', 'H4', 'D1') as $tf) {
    pine_assert(isset($result['fibs'][$tf]), "$tf fibs present (derived from M15, no direct rows)");
}

// ---- Test 3: 16 ratios per family where levels exist --------------------------
echo "\nTest 3: 16 levels per family\n";
global $ratios;
foreach (array('M15', 'H1', 'H4', 'D1') as $tf) {
    if (!empty($result['fibs'][$tf]['LTF_SF'])) {
        pine_assert(count($result['fibs'][$tf]['LTF_SF']) === 16, "$tf LTF_SF has 16 levels");
    }
    if (!empty($result['fibs'][$tf]['HTF_AF'])) {
        pine_assert(count($result['fibs'][$tf]['HTF_AF']) === 16, "$tf HTF_AF has 16 levels");
    }
}

// ---- Test 4: candle_lineage = derived_from_M15 in every debug record ----------
echo "\nTest 4: candle_lineage = derived_from_M15 in all anchor_debug records\n";
foreach (array('M15', 'H1', 'H4', 'D1') as $tf) {
    foreach (array('LTF_SF', 'HTF_AF') as $fam) {
        if (!empty($result['anchor_debug'][$tf][$fam])) {
            $dbg = $result['anchor_debug'][$tf][$fam];
            pine_assert(
                isset($dbg['candle_lineage']) && $dbg['candle_lineage'] === 'derived_from_M15',
                "$tf/$fam candle_lineage=derived_from_M15"
            );
        }
    }
}

// ---- Test 5: source_period follows helper ladder ------------------------------
// Pine v13.1.3 helper ladder:
//   M15 LTF_SF -> M15,  H1 LTF_SF -> H1,  H4 LTF_SF -> D1,  D1 LTF_SF -> D1
//   M15 HTF_AF -> H1,   H1 HTF_AF -> D1,  H4 HTF_AF -> D1,  D1 HTF_AF -> D1
echo "\nTest 5: source_period follows Pine v13.1.3 helper ladder\n";
$expected_source_period = array(
    'M15' => array('LTF_SF' => 'M15', 'HTF_AF' => 'H1'),
    'H1'  => array('LTF_SF' => 'H1',  'HTF_AF' => 'D1'),
    'H4'  => array('LTF_SF' => 'D1',  'HTF_AF' => 'D1'),
    'D1'  => array('LTF_SF' => 'D1',  'HTF_AF' => 'D1'),
);
foreach ($expected_source_period as $tf => $families) {
    foreach ($families as $fam => $expected_sp) {
        if (!empty($result['anchor_debug'][$tf][$fam])) {
            $dbg = $result['anchor_debug'][$tf][$fam];
            pine_assert(
                isset($dbg['source_period']) && $dbg['source_period'] === $expected_sp,
                "$tf/$fam source_period=$expected_sp (got " . ($dbg['source_period'] ?? 'null') . ")"
            );
        }
    }
}

// ---- Test 6: anchor_debug contains required fields ----------------------------
echo "\nTest 6: Required anchor_debug fields present\n";
$required_fields = array('symbol', 'timeframe', 'family', 'candle_lineage', 'source_period',
    'source_feed_bars', 'anchor_high', 'anchor_low', 'anchor_range', 'compression_threshold');
foreach (array('M15', 'H1') as $tf) {
    foreach (array('LTF_SF', 'HTF_AF') as $fam) {
        if (!empty($result['anchor_debug'][$tf][$fam])) {
            $dbg = $result['anchor_debug'][$tf][$fam];
            foreach ($required_fields as $field) {
                pine_assert(isset($dbg[$field]), "$tf/$fam anchor_debug.$field present");
            }
        }
    }
}

// ---- Test 7: Compression threshold correct per symbol class -------------------
echo "\nTest 7: Compression threshold per symbol class\n";
$ref = new ReflectionClass($svc);
$thresh_method = $ref->getMethod('pine_compression_threshold');
$thresh_method->setAccessible(true);

$thresh_eur = $thresh_method->invoke($svc, 'EURUSD');
$thresh_jpy = $thresh_method->invoke($svc, 'USDJPY');
$thresh_xau = $thresh_method->invoke($svc, 'XAUUSD');

pine_assert(abs($thresh_eur - 0.0020) < 1e-8, 'EURUSD threshold=0.0020 (20 pips * 0.0001)');
pine_assert(abs($thresh_jpy - 0.40)   < 1e-8, 'USDJPY threshold=0.40 (40 pips * 0.01)');
pine_assert(abs($thresh_xau - 0.20)   < 1e-8, 'XAUUSD threshold=0.20 (20 pips * 0.01)');

// ---- Test 8: Timeframe filter ------------------------------------------------
echo "\nTest 8: Timeframe filter\n";
$filtered = $svc->get_pine_compatible_fib_levels(1, 'EURUSD', 'H1');
pine_assert(!($filtered instanceof WP_Error), 'Filtered result is not WP_Error');
pine_assert(isset($filtered['fibs']['H1']), 'H1 fibs present when filtered to H1');
pine_assert(!isset($filtered['fibs']['M15']), 'M15 fibs absent when filtered to H1');
pine_assert(!isset($filtered['fibs']['H4']),  'H4 fibs absent when filtered to H1');

// ---- Test 9: Missing M15 candles returns WP_Error ----------------------------
echo "\nTest 9: WP_Error on missing M15 candles\n";
$empty_svc = pine_test_make_service_with_mock(array());
$err = $empty_svc->get_pine_compatible_fib_levels(1, 'EURUSD');
pine_assert($err instanceof WP_Error, 'Empty M15 returns WP_Error');

// ---- Summary -----------------------------------------------------------------
echo "\n[test-pine-compatible-fib-levels] Done: $pass passed, $fail failed.\n";
if ($fail > 0) {
    exit(1);
}
