<?php
/**
 * Phase 5 Regime Parity Validator
 * 
 * Compares MT5 regime snapshots against Pine reference regime classifications
 * to verify HTF bias and LTF regime category parity across historical symbol matrices.
 * 
 * Usage:
 *   php scripts/regime-parity-validator.php --mt5-file mt5-regime.json --pine-file pine-regime.json --out reports/phase5-regime-parity.json
 */

// Parse CLI arguments
$mt5File = null;
$pineFile = null;
$outFile = 'reports/phase5-regime-parity.json';

for ($i = 1; $i < $argc; $i++) {
    if ($argv[$i] === '--mt5-file') {
        $mt5File = $argv[$i + 1] ?? null;
        $i++;
    } elseif ($argv[$i] === '--pine-file') {
        $pineFile = $argv[$i + 1] ?? null;
        $i++;
    } elseif ($argv[$i] === '--out') {
        $outFile = $argv[$i + 1] ?? null;
        $i++;
    }
}

if (!$mt5File || !$pineFile) {
    echo json_encode([
        'error' => 'Missing required inputs',
        'usage' => 'php scripts/regime-parity-validator.php --mt5-file <file> --pine-file <file> [--out <file>]'
    ], JSON_PRETTY_PRINT) . "\n";
    exit(1);
}

// Load input files
if (!file_exists($mt5File) || !file_exists($pineFile)) {
    echo json_encode([
        'error' => 'Input file not found',
        'mt5_file' => $mt5File,
        'pine_file' => $pineFile
    ], JSON_PRETTY_PRINT) . "\n";
    exit(1);
}

$mt5Data = json_decode(file_get_contents($mt5File), true);
$pineData = json_decode(file_get_contents($pineFile), true);

if (!$mt5Data || !$pineData) {
    echo json_encode([
        'error' => 'Failed to parse JSON input files'
    ], JSON_PRETTY_PRINT) . "\n";
    exit(1);
}

// Extract regime records (expected format: array of { symbol, htf_bias, ltf_regime, chop_score, ... })
$mt5Regimes = is_array($mt5Data) ? $mt5Data : ($mt5Data['regimes'] ?? []);
$pineRegimes = is_array($pineData) ? $pineData : ($pineData['regimes'] ?? []);

// Index by symbol for fast lookup
$mt5Index = [];
$pineIndex = [];

foreach ($mt5Regimes as $record) {
    $key = $record['symbol'] ?? null;
    if ($key) {
        $mt5Index[$key] = $record;
    }
}

foreach ($pineRegimes as $record) {
    $key = $record['symbol'] ?? null;
    if ($key) {
        $pineIndex[$key] = $record;
    }
}

// Match records and classify drift
$matches = [];
$htfBiasMatches = 0;
$ltfRegimeMatches = 0;
$totalMatches = 0;
$criticalMismatches = 0;
$chopDriftSum = 0;
$validChopComparisons = 0;

$symbols = array_unique(array_merge(array_keys($mt5Index), array_keys($pineIndex)));

foreach ($symbols as $symbol) {
    $mt5 = $mt5Index[$symbol] ?? null;
    $pine = $pineIndex[$symbol] ?? null;

    if (!$mt5 || !$pine) {
        $criticalMismatches++;
        $matches[] = [
            'symbol' => $symbol,
            'status' => 'MISSING_COUNTERPART',
            'mt5' => $mt5 ? 'present' : 'missing',
            'pine' => $pine ? 'present' : 'missing'
        ];
        continue;
    }

    $totalMatches++;
    $mt5Bias = $mt5['htf_bias'] ?? null;
    $pineBias = $pine['htf_bias'] ?? null;
    $mt5Regime = $mt5['ltf_regime'] ?? null;
    $pineRegime = $pine['ltf_regime'] ?? null;
    $mt5Chop = $mt5['chop_score'] ?? null;
    $pineChop = $pine['chop_score'] ?? null;

    $biasMatch = false;
    $regimeMatch = false;
    $chopDrift = null;

    // HTF Bias classification
    if ($mt5Bias === $pineBias && $mt5Bias !== null) {
        $htfBiasMatches++;
        $biasMatch = true;
    }

    // LTF Regime classification
    if ($mt5Regime === $pineRegime && $mt5Regime !== null) {
        $ltfRegimeMatches++;
        $regimeMatch = true;
    }

    // Chop score drift
    if ($mt5Chop !== null && $pineChop !== null) {
        $chopDrift = abs($mt5Chop - $pineChop);
        $validChopComparisons++;
        $chopDriftSum += $chopDrift;
    }

    $isCritical = !$biasMatch || !$regimeMatch || ($chopDrift !== null && $chopDrift > 0.15);
    if ($isCritical) {
        $criticalMismatches++;
    }

    $matches[] = [
        'symbol' => $symbol,
        'status' => $biasMatch && $regimeMatch ? 'EXACT' : ($chopDrift !== null && $chopDrift <= 0.15 ? 'DRIFT' : 'MISMATCH'),
        'htf_bias' => [
            'mt5' => $mt5Bias,
            'pine' => $pineBias,
            'match' => $biasMatch
        ],
        'ltf_regime' => [
            'mt5' => $mt5Regime,
            'pine' => $pineRegime,
            'match' => $regimeMatch
        ],
        'chop_score' => [
            'mt5' => $mt5Chop,
            'pine' => $pineChop,
            'delta' => $chopDrift
        ]
    ];
}

// Calculate gate metrics
$totalRecords = count($matches);
$biasParityPct = $totalMatches > 0 ? round(($htfBiasMatches / $totalMatches) * 100, 2) : 0;
$regimeParityPct = $totalMatches > 0 ? round(($ltfRegimeMatches / $totalMatches) * 100, 2) : 0;
$avgChopDrift = $validChopComparisons > 0 ? round($chopDriftSum / $validChopComparisons, 4) : 0;

$gatePass = ($biasParityPct >= 95) && ($regimeParityPct >= 90) && ($criticalMismatches === 0);

// Build output report
$report = [
    'run_date' => date('Y-m-d'),
    'gate' => $gatePass ? 'PASS' : 'FAIL',
    'total_symbols' => $totalRecords,
    'bias_parity_pct' => $biasParityPct,
    'regime_parity_pct' => $regimeParityPct,
    'avg_chop_drift' => $avgChopDrift,
    'critical_mismatches_count' => $criticalMismatches,
    'htf_bias_exact_matches' => $htfBiasMatches,
    'ltf_regime_exact_matches' => $ltfRegimeMatches,
    'gate_criteria' => [
        'bias_parity_gte_95_pct' => $biasParityPct >= 95,
        'regime_parity_gte_90_pct' => $regimeParityPct >= 90,
        'critical_mismatches_eq_0' => $criticalMismatches === 0
    ],
    'by_symbol' => $matches
];

// Write output
@mkdir(dirname($outFile), 0755, true);
file_put_contents($outFile, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

echo json_encode([
    'status' => 'complete',
    'gate' => $gatePass ? 'PASS' : 'FAIL',
    'bias_parity_pct' => $biasParityPct,
    'regime_parity_pct' => $regimeParityPct,
    'critical_mismatches' => $criticalMismatches,
    'output_file' => $outFile
], JSON_PRETTY_PRINT) . "\n";

exit($gatePass ? 0 : 1);
?>
