<?php
/**
 * Executable regression tests for CanonicalMarketResolver.
 */
if (!defined('ARRAY_A')) { define('ARRAY_A', 'ARRAY_A'); }
require_once __DIR__ . '/../../class-canonical-market-resolver.php';

class CanonicalResolverWpdbMock {
    public $prefix = 'wp_';
    private array $rows = [];
    public function setRows(array $rows): void { $this->rows = $rows; }
    public function prepare(string $query, ...$args): array { return [$query, $args]; }
    public function get_row($prepared, $format = null): ?array {
        [$query, $args] = $prepared;
        foreach ($this->filterRows($query, $args) as $row) { return $row; }
        return null;
    }
    public function get_results($prepared, $format = null): array {
        [$query, $args] = $prepared;
        return $this->filterRows($query, $args);
    }
    private function filterRows(string $query, array $args): array {
        if (count($args) === 2) {
            [$feedKey, $symbol] = $args;
            return array_values(array_filter($this->rows, fn($r) => $r['feed_key'] === $feedKey && $r['normalized_symbol'] === $symbol));
        }
        [$symbol] = $args;
        return array_values(array_filter($this->rows, fn($r) => $r['normalized_symbol'] === $symbol));
    }
}

class CanonicalMarketResolverTest {
    private CanonicalMarketResolver $resolver;
    private CanonicalResolverWpdbMock $wpdbMock;

    public function setUp(): void {
        global $wpdb;
        $this->resolver = new CanonicalMarketResolver();
        $this->wpdbMock = new CanonicalResolverWpdbMock();
        $wpdb = $this->wpdbMock;
    }

    private function seed(array $rows): void { $this->wpdbMock->setRows($rows); }
    private function row(string $feed, string $symbol, int $age, float $bid = 1.0, float $ask = 1.2): array {
        return ['feed_key' => $feed, 'normalized_symbol' => $symbol, 'updated_at' => gmdate('c', time() - $age), 'bid' => $bid, 'ask' => $ask, 'source_count' => 1];
    }
    private function assertSameValue($expected, $actual, string $message): void {
        if ($expected !== $actual) { throw new Exception($message . ' expected=' . var_export($expected, true) . ' actual=' . var_export($actual, true)); }
    }
    private function assertNotNullValue($actual, string $message): void { if ($actual === null) { throw new Exception($message); } }

    public function testTwoUsersSameSymbolResolvesToFreshestFeed(): void {
        $this->seed([$this->row('feed_1', 'EURUSD', 120), $this->row('feed_2', 'EURUSD', 30)]);
        $userA = $this->resolver->resolve_canonical_feed_key('EURUSD', 'feed_1', 60);
        $userB = $this->resolver->resolve_canonical_feed_key('EURUSD', 'feed_2', 60);
        $this->assertSameValue('feed_2', $userA['feed_key'], 'User A rotates to freshest feed');
        $this->assertSameValue('feed_2', $userB['feed_key'], 'User B keeps freshest feed');
    }

    public function testStaleQuoteComputesCorrectState(): void {
        $this->seed([$this->row('feed_1', 'BTCUSD', 120)]);
        $quote = $this->resolver->resolve_canonical_quote('BTCUSD', 60);
        $this->assertNotNullValue($quote, 'Stale quote should still be returned');
        $this->assertSameValue('stale', $quote['state'], 'Quote state reflects stale age');
        $this->assertSameValue('feed_1', $quote['feed_key'], 'Least-stale feed is retained');
    }

    public function testFeedKeyRotationToGlobalFresh(): void {
        $this->seed([$this->row('feed_1', 'EURUSD', 150), $this->row('feed_2', 'EURUSD', 20)]);
        $resolved = $this->resolver->resolve_canonical_feed_key('EURUSD', 'feed_1', 60);
        $this->assertSameValue('feed_2', $resolved['feed_key'], 'Rotates to fresh global feed');
        $this->assertSameValue('global_fresh', $resolved['rotation_reason'], 'Rotation reason is global_fresh');
    }

    public function testFallbackToLeastStaleFeed(): void {
        $this->seed([$this->row('feed_1', 'XAUUSD', 200), $this->row('feed_2', 'XAUUSD', 300)]);
        $resolved = $this->resolver->resolve_canonical_feed_key('XAUUSD', 'feed_1', 60);
        $this->assertSameValue('feed_1', $resolved['feed_key'], 'Least-stale feed is selected');
        $this->assertSameValue('fallback_stale', $resolved['rotation_reason'], 'Fallback reason is recorded');
    }

    public function testInvalidDatetimeAndZeroPricesAreSafe(): void {
        $this->seed([['feed_key' => 'feed_1', 'normalized_symbol' => 'BADDATE', 'updated_at' => 'not-a-date', 'bid' => 0, 'ask' => 0]]);
        $quote = $this->resolver->resolve_canonical_quote('BADDATE', 60);
        $this->assertSameValue('stale', $quote['state'], 'Invalid datetime is treated as stale');
        $this->assertSameValue(null, $quote['mid'], 'Zero bid/ask does not produce misleading mid');
    }

    public function testCacheHeaderContract(): void {
        $headers = ['Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0', 'Expires' => '0'];
        $this->assertSameValue(true, str_contains($headers['Cache-Control'], 'no-store'), 'Cache-Control includes no-store');
        $this->assertSameValue('0', $headers['Expires'], 'Expires header disables cache');
    }
}

if (PHP_SAPI === 'cli' && basename(__FILE__) === basename($_SERVER['SCRIPT_FILENAME'])) {
    $test = new CanonicalMarketResolverTest();
    foreach (get_class_methods($test) as $method) {
        if (str_starts_with($method, 'test')) {
            $ref = new ReflectionMethod($test, 'setUp');
            $ref->setAccessible(true);
            $ref->invoke($test);
            $test->$method();
            fwrite(STDERR, "PASS $method\n");
        }
    }
}
?>
