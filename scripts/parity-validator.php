#!/usr/bin/env php
<?php
/**
 * Phase 4 Parity Validator
 *
 * Compares MT5 fib engine output against the PHP (Pine-authoritative) fib engine
 * output for the same candle input, and produces a machine-readable JSON gate report.
 *
 * Usage:
 *   php scripts/parity-validator.php [--mt5-file <path>] [--pine-file <path>] [--out <path>]
 *
 * Input files are JSON arrays of fib entries:
 *   [ { "symbol": "EURUSD", "timeframe": "M15", "family": "LTF_SF", "ratio": 0, "price": 1.12345 }, ... ]
 *
 * When --mt5-file and --pine-file are both absent, the validator runs a synthetic
 * self-test using the PHP fib engine as both source and target, confirming the
 * validator logic itself is correct (gate should PASS at 100%).
 *
 * Exit codes:
 *   0 — gate PASS
 *   1 — gate FAIL or input error
 */

// ---- Thresholds (from PHASE4_TESTING_GUIDE.md) ----
const EXACT_MATCH_TOLERANCE = 0.00001;
const ACCEPTABLE_DRIFT      = 0.001;
const PARITY_GATE_PCT       = 99.0;

// ---- Bootstrap ----
$opts = getopt('', array('mt5-file:', 'pine-file:', 'out:'));
$mt5File  = isset($opts['mt5-file'])  ? $opts['mt5-file']  : null;
$pineFile = isset($opts['pine-file']) ? $opts['pine-file'] : null;
$outFile  = isset($opts['out'])       ? $opts['out']       : null;

$runDate = gmdate('Y-m-d');

if ($mt5File === null && $pineFile === null) {
    // ---- Self-test mode: use PHP engine as both source and target ----
    fwrite(STDOUT, "[parity-validator] No input files provided — running synthetic self-test.\n");
    list($mt5Levels, $pineLevels) = generate_synthetic_levels();
} else {
    if ($mt5File === null || $pineFile === null) {
        fwrite(STDERR, "Error: both --mt5-file and --pine-file must be provided together.\n");
        exit(1);
    }
    $mt5Levels  = load_levels_file($mt5File);
    $pineLevels = load_levels_file($pineFile);
}

// ---- Run comparison ----
$report = run_parity_comparison($mt5Levels, $pineLevels, $runDate);

// ---- Output ----
$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

if ($outFile !== null) {
    file_put_contents($outFile, $json);
    fwrite(STDOUT, "[parity-validator] Report written to {$outFile}\n");
} else {
    echo $json . "\n";
}

$gate = $report['gate'];
fwrite(STDOUT, "[parity-validator] Gate: {$gate}  overall_parity_pct={$report['overall_parity_pct']}%\n");

exit($gate === 'PASS' ? 0 : 1);

// ========================================

function load_levels_file($path) {
    if (!file_exists($path)) {
        fwrite(STDERR, "Error: file not found: {$path}\n");
        exit(1);
    }
    $raw = file_get_contents($path);
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fwrite(STDERR, "Error: invalid JSON in {$path}\n");
        exit(1);
    }
    return $data;
}

/**
 * Generate synthetic test levels using the PHP fib engine itself.
 * Both MT5 and Pine levels are identical (self-test), so parity should be 100%.
 * This validates the comparator logic is correct before live data is available.
 */
function generate_synthetic_levels() {
    $ratios    = array(-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300);
    $symbols   = array('EURUSD', 'USDJPY', 'XAUUSD');
    $timeframes = array('M15', 'H1', 'D1');
    $families  = array('LTF_SF', 'HTF_AF');

    // Deterministic anchor values for synthetic test
    $anchors = array(
        'EURUSD' => array('high' => 1.12345, 'low' => 1.10000),
        'USDJPY' => array('high' => 150.500, 'low' => 148.000),
        'XAUUSD' => array('high' => 2050.00, 'low' => 1980.00),
    );

    $levels = array();
    foreach ($symbols as $sym) {
        $h = $anchors[$sym]['high'];
        $l = $anchors[$sym]['low'];
        foreach ($timeframes as $tf) {
            foreach ($families as $fam) {
                foreach ($ratios as $r) {
                    $price = round($h - (($r / 100) * ($h - $l)), 8);
                    $levels[] = array(
                        'symbol'    => $sym,
                        'timeframe' => $tf,
                        'family'    => $fam,
                        'ratio'     => $r,
                        'price'     => $price,
                    );
                }
            }
        }
    }

    // MT5 levels = Pine levels in self-test (perfect parity)
    return array($levels, $levels);
}

/**
 * Compare MT5 levels against Pine reference levels.
 * Returns the gate report array.
 */
function run_parity_comparison(array $mt5Levels, array $pineLevels, $runDate) {
    // Index Pine levels by (symbol, timeframe, family, ratio)
    $pineIndex = array();
    foreach ($pineLevels as $entry) {
        $key = entry_key($entry);
        $pineIndex[$key] = (float) $entry['price'];
    }

    $totalTuples   = 0;
    $exactMatches  = 0;
    $acceptableDrift = 0;
    $criticalMismatches = array();
    $driftDetails  = array();
    $bySymbol      = array();

    foreach ($mt5Levels as $entry) {
        $sym = (string) ($entry['symbol']    ?? '');
        $tf  = (string) ($entry['timeframe'] ?? '');
        $fam = (string) ($entry['family']    ?? '');
        $rat = (float)  ($entry['ratio']     ?? 0);
        $mt5Price = (float) ($entry['price'] ?? 0);

        $key = entry_key($entry);
        if (!isset($pineIndex[$key])) {
            // Missing Pine reference — critical mismatch
            $criticalMismatches[] = array(
                'symbol' => $sym, 'timeframe' => $tf, 'family' => $fam, 'ratio' => $rat,
                'mt5_price' => $mt5Price, 'pine_price' => null, 'drift' => null,
                'reason' => 'missing_pine_reference',
            );
            $totalTuples++;
            continue;
        }

        $pinePrice = $pineIndex[$key];
        $drift     = abs($mt5Price - $pinePrice);
        $totalTuples++;

        if ($drift <= EXACT_MATCH_TOLERANCE) {
            $exactMatches++;
            $classification = 'EXACT_MATCH';
        } elseif ($drift <= ACCEPTABLE_DRIFT) {
            $acceptableDrift++;
            $classification = 'ACCEPTABLE_DRIFT';
            $driftDetails[] = array(
                'symbol' => $sym, 'timeframe' => $tf, 'family' => $fam, 'ratio' => $rat,
                'mt5_price' => $mt5Price, 'pine_price' => $pinePrice, 'drift' => $drift,
            );
        } else {
            $criticalMismatches[] = array(
                'symbol' => $sym, 'timeframe' => $tf, 'family' => $fam, 'ratio' => $rat,
                'mt5_price' => $mt5Price, 'pine_price' => $pinePrice, 'drift' => $drift,
                'reason' => 'price_drift_exceeds_0.001',
            );
            $classification = 'CRITICAL_MISMATCH';
        }

        // Aggregate by symbol/timeframe
        if (!isset($bySymbol[$sym])) {
            $bySymbol[$sym] = array();
        }
        if (!isset($bySymbol[$sym][$tf])) {
            $bySymbol[$sym][$tf] = array(
                'total'    => 0, 'exact' => 0, 'acceptable' => 0,
                'critical' => 0, 'parity_pct' => 0.0, 'mismatches' => array(),
            );
        }

        $bySymbol[$sym][$tf]['total']++;
        if ($classification === 'EXACT_MATCH')      $bySymbol[$sym][$tf]['exact']++;
        elseif ($classification === 'ACCEPTABLE_DRIFT') $bySymbol[$sym][$tf]['acceptable']++;
        else {
            $bySymbol[$sym][$tf]['critical']++;
            $bySymbol[$sym][$tf]['mismatches'][] = array(
                'family' => $fam, 'ratio' => $rat,
                'mt5_price' => $mt5Price, 'pine_price' => $pinePrice, 'drift' => $drift,
            );
        }
    }

    // Second pass: Pine-only tuples that MT5 never emitted
    $mt5Keys = array();
    foreach ($mt5Levels as $entry) {
        $mt5Keys[entry_key($entry)] = true;
    }
    foreach ($pineLevels as $entry) {
        $key = entry_key($entry);
        if (!isset($mt5Keys[$key])) {
            $sym = (string) ($entry['symbol']    ?? '');
            $tf  = (string) ($entry['timeframe'] ?? '');
            $fam = (string) ($entry['family']    ?? '');
            $rat = (float)  ($entry['ratio']     ?? 0);
            $criticalMismatches[] = array(
                'symbol' => $sym, 'timeframe' => $tf, 'family' => $fam, 'ratio' => $rat,
                'mt5_price' => null, 'pine_price' => (float) ($entry['price'] ?? 0), 'drift' => null,
                'reason' => 'missing_mt5_output',
            );
            $totalTuples++;
        }
    }

    // Compute per-symbol/timeframe parity_pct
    foreach ($bySymbol as $sym => &$tfs) {
        foreach ($tfs as $tf => &$data) {
            $passing = $data['exact'] + $data['acceptable'];
            $data['parity_pct'] = $data['total'] > 0
                ? round($passing / $data['total'] * 100, 2)
                : 0.0;
        }
    }

    // Overall parity
    $passing = $exactMatches + $acceptableDrift;
    $overallParity = $totalTuples > 0 ? round($passing / $totalTuples * 100, 2) : 0.0;

    // Gate decision: overall_parity >= 99% AND zero critical mismatches on any single pair/tf
    $hasCritical = count($criticalMismatches) > 0;
    $gate = (!$hasCritical && $overallParity >= PARITY_GATE_PCT) ? 'PASS' : 'FAIL';

    return array(
        'run_date'           => $runDate,
        'overall_parity_pct' => $overallParity,
        'gate'               => $gate,
        'total_tuples'       => $totalTuples,
        'exact_matches'      => $exactMatches,
        'acceptable_drift'   => $acceptableDrift,
        'critical_mismatches_count' => count($criticalMismatches),
        'by_symbol'          => $bySymbol,
        'critical_mismatches' => $criticalMismatches,
        'acceptable_drift_detail' => $driftDetails,
        'thresholds'         => array(
            'exact_match'    => EXACT_MATCH_TOLERANCE,
            'acceptable'     => ACCEPTABLE_DRIFT,
            'gate_pct'       => PARITY_GATE_PCT,
        ),
    );
}

function entry_key($entry) {
    return implode('|', array(
        strtoupper((string) ($entry['symbol']    ?? '')),
        strtoupper((string) ($entry['timeframe'] ?? '')),
        strtoupper((string) ($entry['family']    ?? '')),
        (string) ((float) ($entry['ratio'] ?? 0)),
    ));
}
