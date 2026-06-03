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
 *   0 - gate PASS
 *   1 - gate FAIL or input error
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
    fwrite(STDOUT, "[parity-validator] No input files provided - running synthetic self-test.\n");
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

function phase4_required_symbols() {
    return array('EURUSD', 'USDJPY', 'XAUUSD');
}

function phase4_required_timeframes() {
    return array('M15', 'H1', 'H4', 'D1');
}

function phase4_required_families() {
    return array('LTF_SF', 'HTF_AF');
}

function phase4_required_ratios() {
    return array(-200, -162.5, -100, -62.5, -25, 0, 25, 50, 62.5, 75, 100, 125, 162.5, 200, 262.5, 300);
}

function phase4_required_tuples() {
    $required = array();
    foreach (phase4_required_symbols() as $symbol) {
        foreach (phase4_required_timeframes() as $timeframe) {
            foreach (phase4_required_families() as $family) {
                foreach (phase4_required_ratios() as $ratio) {
                    $entry = array(
                        'symbol' => $symbol,
                        'timeframe' => $timeframe,
                        'family' => $family,
                        'ratio' => $ratio,
                    );
                    $required[entry_key($entry)] = $entry;
                }
            }
        }
    }
    return $required;
}

function build_levels_index(array $levels) {
    $index = array();
    foreach ($levels as $entry) {
        $key = entry_key($entry);
        $index[$key] = array(
            'symbol' => (string) ($entry['symbol'] ?? ''),
            'timeframe' => (string) ($entry['timeframe'] ?? ''),
            'family' => (string) ($entry['family'] ?? ''),
            'ratio' => (float) ($entry['ratio'] ?? 0),
            'price' => isset($entry['price']) ? (float) $entry['price'] : null,
        );
    }
    return $index;
}

function ensure_symbol_timeframe_bucket(array &$bySymbol, $symbol, $timeframe) {
    if (!isset($bySymbol[$symbol])) {
        $bySymbol[$symbol] = array();
    }
    if (!isset($bySymbol[$symbol][$timeframe])) {
        $bySymbol[$symbol][$timeframe] = array(
            'total' => 0,
            'exact' => 0,
            'acceptable' => 0,
            'critical' => 0,
            'parity_pct' => 0.0,
            'mismatches' => array(),
        );
    }
}

function record_bucket_mismatch(array &$bySymbol, $symbol, $timeframe, array $mismatch) {
    ensure_symbol_timeframe_bucket($bySymbol, $symbol, $timeframe);
    $bySymbol[$symbol][$timeframe]['critical']++;
    $bySymbol[$symbol][$timeframe]['mismatches'][] = $mismatch;
}

/**
 * Generate synthetic test levels using the PHP fib engine itself.
 * Both MT5 and Pine levels are identical (self-test), so parity should be 100%.
 * This validates the comparator logic is correct before live data is available.
 */
function generate_synthetic_levels() {
    $ratios    = phase4_required_ratios();
    $symbols   = phase4_required_symbols();
    $timeframes = phase4_required_timeframes();
    $families  = phase4_required_families();

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

    return array($levels, $levels);
}

/**
 * Compare MT5 levels against Pine reference levels.
 * Returns the gate report array.
 */
function run_parity_comparison(array $mt5Levels, array $pineLevels, $runDate) {
    $requiredTuples = phase4_required_tuples();
    $mt5Index = build_levels_index($mt5Levels);
    $pineIndex = build_levels_index($pineLevels);

    $totalTuples = 0;
    $exactMatches = 0;
    $acceptableDrift = 0;
    $criticalMismatches = array();
    $driftDetails = array();
    $bySymbol = array();
    $mt5PresentGroups = array();
    $pinePresentGroups = array();

    foreach ($requiredTuples as $key => $required) {
        $sym = $required['symbol'];
        $tf  = $required['timeframe'];
        $fam = $required['family'];
        $rat = (float) $required['ratio'];
        $groupKey = $sym . '|' . $tf . '|' . $fam;

        ensure_symbol_timeframe_bucket($bySymbol, $sym, $tf);
        $totalTuples++;

        $mt5Present = isset($mt5Index[$key]);
        $pinePresent = isset($pineIndex[$key]);

        if ($mt5Present) {
            $mt5PresentGroups[$groupKey] = true;
        }
        if ($pinePresent) {
            $pinePresentGroups[$groupKey] = true;
        }

        if (!$mt5Present || !$pinePresent) {
            $reason = (!$mt5Present && !$pinePresent)
                ? 'missing_required_tuple_in_both_sources'
                : (!$mt5Present ? 'missing_required_mt5_output' : 'missing_required_pine_reference');
            $bySymbol[$sym][$tf]['total']++;
            $criticalMismatches[] = array(
                'symbol' => $sym,
                'timeframe' => $tf,
                'family' => $fam,
                'ratio' => $rat,
                'mt5_price' => $mt5Present ? $mt5Index[$key]['price'] : null,
                'pine_price' => $pinePresent ? $pineIndex[$key]['price'] : null,
                'drift' => null,
                'reason' => $reason,
            );
            record_bucket_mismatch($bySymbol, $sym, $tf, array(
                'family' => $fam,
                'ratio' => $rat,
                'mt5_price' => $mt5Present ? $mt5Index[$key]['price'] : null,
                'pine_price' => $pinePresent ? $pineIndex[$key]['price'] : null,
                'drift' => null,
                'reason' => $reason,
            ));
            continue;
        }

        $mt5Price = $mt5Index[$key]['price'];
        $pinePrice = $pineIndex[$key]['price'];
        $drift = abs($mt5Price - $pinePrice);

        $bySymbol[$sym][$tf]['total']++;

        if ($drift <= EXACT_MATCH_TOLERANCE) {
            $exactMatches++;
            $bySymbol[$sym][$tf]['exact']++;
            continue;
        }

        if ($drift <= ACCEPTABLE_DRIFT) {
            $acceptableDrift++;
            $bySymbol[$sym][$tf]['acceptable']++;
            $driftDetails[] = array(
                'symbol' => $sym,
                'timeframe' => $tf,
                'family' => $fam,
                'ratio' => $rat,
                'mt5_price' => $mt5Price,
                'pine_price' => $pinePrice,
                'drift' => $drift,
            );
            continue;
        }

        $criticalMismatches[] = array(
            'symbol' => $sym,
            'timeframe' => $tf,
            'family' => $fam,
            'ratio' => $rat,
            'mt5_price' => $mt5Price,
            'pine_price' => $pinePrice,
            'drift' => $drift,
            'reason' => 'price_drift_exceeds_0.001',
        );
        record_bucket_mismatch($bySymbol, $sym, $tf, array(
            'family' => $fam,
            'ratio' => $rat,
            'mt5_price' => $mt5Price,
            'pine_price' => $pinePrice,
            'drift' => $drift,
            'reason' => 'price_drift_exceeds_0.001',
        ));
    }


    $nonRequiredKeys = array_unique(array_merge(array_keys($mt5Index), array_keys($pineIndex)));
    foreach ($nonRequiredKeys as $key) {
        if (isset($requiredTuples[$key])) {
            continue;
        }

        $mt5Present = isset($mt5Index[$key]);
        $pinePresent = isset($pineIndex[$key]);
        $tuple = $mt5Present ? $mt5Index[$key] : $pineIndex[$key];

        $sym = strtoupper((string) ($tuple['symbol'] ?? ''));
        $tf  = strtoupper((string) ($tuple['timeframe'] ?? ''));
        $fam = strtoupper((string) ($tuple['family'] ?? ''));
        $rat = (float) ($tuple['ratio'] ?? 0);

        ensure_symbol_timeframe_bucket($bySymbol, $sym, $tf);
        $totalTuples++;

        if (!$mt5Present || !$pinePresent) {
            $reason = (!$mt5Present && !$pinePresent)
                ? 'missing_tuple_in_both_sources'
                : (!$mt5Present ? 'missing_mt5_output' : 'missing_pine_reference');
            $bySymbol[$sym][$tf]['total']++;
            $criticalMismatches[] = array(
                'symbol' => $sym,
                'timeframe' => $tf,
                'family' => $fam,
                'ratio' => $rat,
                'mt5_price' => $mt5Present ? $mt5Index[$key]['price'] : null,
                'pine_price' => $pinePresent ? $pineIndex[$key]['price'] : null,
                'drift' => null,
                'reason' => $reason,
            );
            record_bucket_mismatch($bySymbol, $sym, $tf, array(
                'family' => $fam,
                'ratio' => $rat,
                'mt5_price' => $mt5Present ? $mt5Index[$key]['price'] : null,
                'pine_price' => $pinePresent ? $pineIndex[$key]['price'] : null,
                'drift' => null,
                'reason' => $reason,
            ));
            continue;
        }

        $mt5Price = $mt5Index[$key]['price'];
        $pinePrice = $pineIndex[$key]['price'];
        $drift = abs($mt5Price - $pinePrice);

        $bySymbol[$sym][$tf]['total']++;

        if ($drift <= EXACT_MATCH_TOLERANCE) {
            $exactMatches++;
            $bySymbol[$sym][$tf]['exact']++;
            continue;
        }

        if ($drift <= ACCEPTABLE_DRIFT) {
            $acceptableDrift++;
            $bySymbol[$sym][$tf]['acceptable']++;
            $driftDetails[] = array(
                'symbol' => $sym,
                'timeframe' => $tf,
                'family' => $fam,
                'ratio' => $rat,
                'mt5_price' => $mt5Price,
                'pine_price' => $pinePrice,
                'drift' => $drift,
            );
            continue;
        }

        $criticalMismatches[] = array(
            'symbol' => $sym,
            'timeframe' => $tf,
            'family' => $fam,
            'ratio' => $rat,
            'mt5_price' => $mt5Price,
            'pine_price' => $pinePrice,
            'drift' => $drift,
            'reason' => 'price_drift_exceeds_0.001',
        );
        record_bucket_mismatch($bySymbol, $sym, $tf, array(
            'family' => $fam,
            'ratio' => $rat,
            'mt5_price' => $mt5Price,
            'pine_price' => $pinePrice,
            'drift' => $drift,
            'reason' => 'price_drift_exceeds_0.001',
        ));
    }

    foreach ($bySymbol as $sym => &$tfs) {        foreach ($tfs as $tf => &$data) {
            $passing = $data['exact'] + $data['acceptable'];
            $data['parity_pct'] = $data['total'] > 0
                ? round($passing / $data['total'] * 100, 2)
                : 0.0;
        }
    }
    unset($data, $tfs);

    $passing = $exactMatches + $acceptableDrift;
    $overallParity = $totalTuples > 0 ? round($passing / $totalTuples * 100, 2) : 0.0;

    $hasCritical = count($criticalMismatches) > 0;
    $gate = (!$hasCritical && $overallParity >= PARITY_GATE_PCT) ? 'PASS' : 'FAIL';

    $mt5RequiredMatches = count(array_intersect_key($requiredTuples, $mt5Index));
    $pineRequiredMatches = count(array_intersect_key($requiredTuples, $pineIndex));

    return array(
        'run_date' => $runDate,
        'overall_parity_pct' => $overallParity,
        'gate' => $gate,
        'total_tuples' => $totalTuples,
        'exact_matches' => $exactMatches,
        'acceptable_drift' => $acceptableDrift,
        'critical_mismatches_count' => count($criticalMismatches),
        'by_symbol' => $bySymbol,
        'critical_mismatches' => $criticalMismatches,
        'acceptable_drift_detail' => $driftDetails,
        'required_coverage' => array(
            'symbols' => phase4_required_symbols(),
            'timeframes' => phase4_required_timeframes(),
            'families' => phase4_required_families(),
            'ratios_per_group' => count(phase4_required_ratios()),
            'expected_tuple_count' => count($requiredTuples),
            'expected_group_count' => count(phase4_required_symbols()) * count(phase4_required_timeframes()) * count(phase4_required_families()),
            'mt5_present_tuple_count' => $mt5RequiredMatches,
            'pine_present_tuple_count' => $pineRequiredMatches,
            'mt5_present_group_count' => count($mt5PresentGroups),
            'pine_present_group_count' => count($pinePresentGroups),
            'mt5_missing_tuple_count' => count($requiredTuples) - $mt5RequiredMatches,
            'pine_missing_tuple_count' => count($requiredTuples) - $pineRequiredMatches,
        ),
        'ignored_non_phase4_tuples' => array(
            'mt5_count' => count(array_diff_key($mt5Index, $requiredTuples)),
            'pine_count' => count(array_diff_key($pineIndex, $requiredTuples)),
        ),
        'thresholds' => array(
            'exact_match' => EXACT_MATCH_TOLERANCE,
            'acceptable' => ACCEPTABLE_DRIFT,
            'gate_pct' => PARITY_GATE_PCT,
        ),
    );
}

function entry_key($entry) {
    return implode('|', array(
        strtoupper((string) ($entry['symbol'] ?? '')),
        strtoupper((string) ($entry['timeframe'] ?? '')),
        strtoupper((string) ($entry['family'] ?? '')),
        (string) ((float) ($entry['ratio'] ?? 0)),
    ));
}
