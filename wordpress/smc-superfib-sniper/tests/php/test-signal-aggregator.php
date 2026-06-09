<?php
/**
 * Tests: SMC_SF_Signal_Aggregator::dedupe_by_canonical_symbol()
 *
 * Harness: custom lightweight WP stubs (no Composer, no WP-CLI scaffolding).
 * Pattern mirrors test-watchlist-snapshot-regression.php.
 */

define( 'ABSPATH', __DIR__ . '/' );

// ── Minimal WP stubs ─────────────────────────────────────────────────────────
if ( ! function_exists( 'add_action' ) )             { function add_action( ...$a ) {} }
if ( ! function_exists( 'add_filter' ) )             { function add_filter( ...$a ) {} }
if ( ! function_exists( 'register_activation_hook' ) ) { function register_activation_hook( ...$a ) {} }
if ( ! function_exists( 'register_deactivation_hook' ) ) { function register_deactivation_hook( ...$a ) {} }
if ( ! function_exists( 'plugin_dir_path' ) ) {
    function plugin_dir_path( $f ) { return dirname( $f ) . DIRECTORY_SEPARATOR; }
}
if ( ! class_exists( 'WP_REST_Request' ) ) {
    class WP_REST_Request {
        private $params;
        public function __construct( $params = array() ) { $this->params = $params; }
        public function get_json_params() { return $this->params; }
    }
}
if ( ! class_exists( 'WP_Error' ) ) {
    class WP_Error {
        public $code; public $message; public $data;
        public function __construct( $c = '', $m = '', $d = null ) {
            $this->code = $c; $this->message = $m; $this->data = $d;
        }
    }
}

// ── Load the aggregator class under test ─────────────────────────────────────
require_once dirname( __DIR__, 2 ) . '/class-signal-aggregator.php';

// ── Lightweight test helpers ──────────────────────────────────────────────────
function fail( $msg ) {
    fwrite( STDERR, "FAIL: {$msg}" . PHP_EOL );
    exit( 1 );
}

function assert_true( $cond, $msg ) {
    if ( ! $cond ) { fail( $msg ); }
}

function assert_same( $expected, $actual, $msg ) {
    if ( $expected !== $actual ) {
        fail( $msg . ' expected=' . var_export( $expected, true ) . ' actual=' . var_export( $actual, true ) );
    }
}

// ── Identity normaliser (pass-through) and alias normaliser ──────────────────
function identity_normalize( string $symbol ): string {
    return strtoupper( $symbol );
}

/**
 * Minimal alias map that strips the '.c' broker suffix to its canonical form.
 * Mirrors the safe suffix-stripping logic in SMC_SuperFib_Sniper_REST::map_symbol_aliases().
 */
function broker_normalize( string $symbol ): string {
    $upper = strtoupper( $symbol );
    // Strip recognised single-character broker suffixes preceded by '.'
    if ( preg_match( '/^([A-Z0-9]+)\.[A-Z]$/', $upper, $m ) ) {
        return $m[1];
    }
    return $upper;
}

// ── Test cases ────────────────────────────────────────────────────────────────
$aggregator = new SMC_SF_Signal_Aggregator();

// Expose dedupe_by_canonical_symbol via Reflection (private in production, public here).
$ref    = new ReflectionClass( $aggregator );
$method = $ref->getMethod( 'dedupe_by_canonical_symbol' );
$method->setAccessible( true );

function dedupe( SMC_SF_Signal_Aggregator $agg, ReflectionMethod $m, array $prices, callable $fn ): array {
    return $m->invoke( $agg, $prices, $fn );
}

// ── Test 1: USDCHF and USDCHF.c collapse to one canonical USDCHF ─────────────
$prices = array(
    array( 'symbol' => 'USDCHF',   'state' => 'live',  'updatedAt' => '2026-06-09T10:00:00Z' ),
    array( 'symbol' => 'USDCHF.c', 'state' => 'stale', 'updatedAt' => '2026-06-09T10:00:00Z' ),
);
$result = dedupe( $aggregator, $method, $prices, 'broker_normalize' );

assert_same( 1, count( $result ), 'USDCHF and USDCHF.c must collapse to a single canonical row' );
assert_same( 'USDCHF', $result[0]['symbol'], 'Surviving row must carry the canonical symbol USDCHF' );
assert_same( 'live',   $result[0]['state'],  'live beats stale — live row must survive the broker-suffix dedupe' );

// ── Test 2: live beats stale for the same canonical symbol ───────────────────
$prices = array(
    array( 'symbol' => 'EURUSD', 'state' => 'stale', 'updatedAt' => '2026-06-09T10:05:00Z' ),
    array( 'symbol' => 'EURUSD', 'state' => 'live',  'updatedAt' => '2026-06-09T10:00:00Z' ),
);
$result = dedupe( $aggregator, $method, $prices, 'identity_normalize' );

assert_same( 1,      count( $result ),     'Duplicate canonical symbols must produce exactly one output row' );
assert_same( 'live', $result[0]['state'],  'live must beat stale regardless of updatedAt order' );

// ── Test 3: newer timestamp wins when freshness rank ties ────────────────────
$prices = array(
    array( 'symbol' => 'GBPUSD', 'state' => 'stale', 'updatedAt' => '2026-06-09T09:50:00Z' ),
    array( 'symbol' => 'GBPUSD', 'state' => 'stale', 'updatedAt' => '2026-06-09T10:05:00Z' ),
);
$result = dedupe( $aggregator, $method, $prices, 'identity_normalize' );

assert_same( 1,                        count( $result ),          'Tied freshness rows must produce exactly one output row' );
assert_same( '2026-06-09T10:05:00Z',  $result[0]['updatedAt'],   'Newer updatedAt must win when freshness rank ties' );

// ── Test 4: closed_session does not displace a live entry ────────────────────
$prices = array(
    array( 'symbol' => 'USDJPY', 'state' => 'closed_session', 'updatedAt' => '2026-06-09T11:00:00Z' ),
    array( 'symbol' => 'USDJPY', 'state' => 'live',           'updatedAt' => '2026-06-09T10:00:00Z' ),
);
$result = dedupe( $aggregator, $method, $prices, 'identity_normalize' );

assert_same( 1,      count( $result ),    'closed_session vs live must produce exactly one output row' );
assert_same( 'live', $result[0]['state'], 'live must beat closed_session even when closed_session has a later updatedAt' );

// ── Test 5: offline source does not displace a live source ───────────────────
$prices = array(
    array( 'symbol' => 'AUDUSD', 'state' => 'offline', 'updatedAt' => '2026-06-09T11:30:00Z' ),
    array( 'symbol' => 'AUDUSD', 'state' => 'live',    'updatedAt' => '2026-06-09T10:00:00Z' ),
);
$result = dedupe( $aggregator, $method, $prices, 'identity_normalize' );

assert_same( 1,      count( $result ),    'offline vs live must produce exactly one output row' );
assert_same( 'live', $result[0]['state'], 'live must beat offline even when offline has a later updatedAt' );

// ── All passed ────────────────────────────────────────────────────────────────
fwrite( STDOUT, 'signal aggregator dedupe checks passed' . PHP_EOL );
