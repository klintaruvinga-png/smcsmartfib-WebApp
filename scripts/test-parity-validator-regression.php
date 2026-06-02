<?php
/**
 * Regression tests for parity validator payload extraction and missing counterpart gates.
 *
 * Tests:
 *   1. Signal validator accepts { "signals": [...] } keyed payload  → gate=FAIL (NO_PINE)
 *   2. Signal validator accepts EA { "candidates": [...] } payload
 *   3. Signal validator accepts bare array payload
 *   4. MT5-only (NO_PINE) signal causes gate=FAIL
 *   5. Pine-only (NO_MT5) signal causes gate=FAIL
 *   6. Regime validator accepts { "regimes": [...] } keyed payload  → gate=FAIL (MISSING_COUNTERPART)
 *   7. Missing regime counterpart causes gate=FAIL
 *   8. Display schema plugin uses the stable smc-superfib-sniper slug
 *   9. Display schema SQL includes backend_confirmed column
 */

$pass = 0;
$fail = 0;

function assert_eq(string $label, $expected, $actual): void {
    global $pass, $fail;
    if ($actual === $expected) {
        echo "[PASS] $label\n";
        $pass++;
    } else {
        echo "[FAIL] $label\n";
        echo "       expected: " . json_encode($expected) . "\n";
        echo "       actual:   " . json_encode($actual) . "\n";
        $fail++;
    }
}

function write_json_file(array $payload, string $prefix): string {
    $path = tempnam(sys_get_temp_dir(), $prefix);
    file_put_contents($path, json_encode($payload, JSON_THROW_ON_ERROR));
    return $path;
}

function run_validator(string $scriptName, array $mt5Payload, array $pinePayload, string $prefix): array {
    $tmpMt5 = write_json_file($mt5Payload, "mt5{$prefix}_");
    $tmpPine = write_json_file($pinePayload, "pine{$prefix}_");
    $tmpOut = tempnam(sys_get_temp_dir(), "rpt{$prefix}_");

    $script = __DIR__ . "/{$scriptName}";
    $command = sprintf(
        'php %s --mt5-file %s --pine-file %s --out %s 2>&1',
        escapeshellarg($script),
        escapeshellarg($tmpMt5),
        escapeshellarg($tmpPine),
        escapeshellarg($tmpOut)
    );
    exec($command, $output, $rc);

    $report = file_exists($tmpOut) ? json_decode(file_get_contents($tmpOut), true) : [];
    foreach ([$tmpMt5, $tmpPine, $tmpOut] as $file) {
        @unlink($file);
    }

    return is_array($report) ? $report : [];
}

function run_signal_validator(array $mt5Payload, array $pinePayload): array {
    return run_validator('signal-parity-validator.php', $mt5Payload, $pinePayload, 'sig');
}

function run_regime_validator(array $mt5Payload, array $pinePayload): array {
    return run_validator('regime-parity-validator.php', $mt5Payload, $pinePayload, 'reg');
}

function resolve_plugin_file(): string {
    return __DIR__ . '/../wordpress/smc-superfib-sniper/smc-superfib-sniper.php';
}

// ---------------------------------------------------------------------------
// Signal fixtures
// ---------------------------------------------------------------------------

$mt5Signal = ['symbol' => 'EURUSD', 'direction' => 'BUY', 'entry_price' => 1.1000, 'created_at' => '2026-06-01T10:00:00Z'];
$pineSignal = ['symbol' => 'EURUSD', 'direction' => 'BUY', 'entry_price' => 1.1001, 'created_at' => '2026-06-01T10:00:00Z'];

// ---------------------------------------------------------------------------
// TEST 1: Signal validator accepts keyed { "signals": [...] } and detects NO_PINE → gate=FAIL
// ---------------------------------------------------------------------------
$r = run_signal_validator(['signals' => [$mt5Signal]], ['signals' => []]);
assert_eq('Signal validator: keyed JSON wrapper accepted (gate=FAIL on NO_PINE)', 'FAIL', $r['gate'] ?? null);
assert_eq('Signal validator: no_pine_counterpart=1', 1, $r['no_pine_counterpart'] ?? null);

// ---------------------------------------------------------------------------
// TEST 2: Signal validator accepts EA { "candidates": [...] } payload (matched, gate=PASS)
// ---------------------------------------------------------------------------
$r = run_signal_validator(['candidates' => [$mt5Signal]], [$pineSignal]);
assert_eq('Signal validator: candidates wrapper accepted (gate=PASS)', 'PASS', $r['gate'] ?? null);
assert_eq('Signal validator: candidates wrapper increments total_signals', 1, $r['total_signals'] ?? null);

// ---------------------------------------------------------------------------
// TEST 3: Signal validator bare array still works (matched, gate=PASS)
// ---------------------------------------------------------------------------
$r = run_signal_validator([$mt5Signal], [$pineSignal]);
assert_eq('Signal validator: bare array accepted (gate=PASS)', 'PASS', $r['gate'] ?? null);

// ---------------------------------------------------------------------------
// TEST 4: MT5-only NO_PINE increments totalSignals and causes gate=FAIL
// ---------------------------------------------------------------------------
$r = run_signal_validator(['signals' => [$mt5Signal]], ['signals' => []]);
assert_eq('NO_PINE causes gate=FAIL', 'FAIL', $r['gate'] ?? null);
assert_eq('NO_PINE increments total_signals', 1, $r['total_signals'] ?? null);
assert_eq('NO_PINE increments mismatches', 1, $r['mismatches'] ?? null);

// ---------------------------------------------------------------------------
// TEST 5: Pine-only NO_MT5 increments mismatches and causes gate=FAIL
// ---------------------------------------------------------------------------
$r = run_signal_validator(['signals' => []], ['signals' => [$pineSignal]]);
assert_eq('NO_MT5 causes gate=FAIL', 'FAIL', $r['gate'] ?? null);
assert_eq('NO_MT5 increments mismatches', 1, $r['mismatches'] ?? null);
assert_eq('NO_MT5 increments no_mt5_counterpart', 1, $r['no_mt5_counterpart'] ?? null);

// ---------------------------------------------------------------------------
// Regime fixtures
// ---------------------------------------------------------------------------
$mt5Regime = ['symbol' => 'EURUSD', 'htf_bias' => 'BULLISH', 'ltf_regime' => 'TREND_UP', 'chop_score' => 30.0];
$pineRegime = ['symbol' => 'EURUSD', 'htf_bias' => 'BULLISH', 'ltf_regime' => 'TREND_UP', 'chop_score' => 30.0];
$extraMt5 = ['symbol' => 'GBPUSD', 'htf_bias' => 'BEARISH', 'ltf_regime' => 'TREND_DOWN', 'chop_score' => 25.0];

// ---------------------------------------------------------------------------
// TEST 6: Regime validator accepts keyed { "regimes": [...] } and detects MISSING → gate=FAIL
// ---------------------------------------------------------------------------
$r = run_regime_validator(['regimes' => [$mt5Regime, $extraMt5]], ['regimes' => [$pineRegime]]);
assert_eq('Regime validator: keyed JSON wrapper accepted (gate=FAIL on MISSING_COUNTERPART)', 'FAIL', $r['gate'] ?? null);

// ---------------------------------------------------------------------------
// TEST 7: Missing regime counterpart increments criticalMismatches → gate=FAIL
// ---------------------------------------------------------------------------
assert_eq('MISSING_COUNTERPART increments critical_mismatches_count', 1, $r['critical_mismatches_count'] ?? null);

// ---------------------------------------------------------------------------
// TEST 8: Display schema plugin uses the stable smc-superfib-sniper slug
// ---------------------------------------------------------------------------
$pluginFile = resolve_plugin_file();
assert_eq('Display schema plugin file uses stable plugin slug', true, file_exists($pluginFile));

// ---------------------------------------------------------------------------
// TEST 9: Display schema SQL includes backend_confirmed column
// ---------------------------------------------------------------------------
if (file_exists($pluginFile)) {
    $src = file_get_contents($pluginFile);
    $inSql = false;
    $found = false;
    foreach (explode("\n", $src) as $line) {
        if (str_contains($line, 'function get_display_signals_table_sql')) {
            $inSql = true;
        }
        if ($inSql && str_contains($line, 'backend_confirmed')) {
            $found = true;
            break;
        }
        if ($inSql && str_contains($line, 'PRIMARY KEY')) {
            break;
        }
    }
    assert_eq('Display schema SQL contains backend_confirmed column', true, $found);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
echo "\n--- Results: $pass passed, $fail failed ---\n";
exit($fail > 0 ? 1 : 0);
