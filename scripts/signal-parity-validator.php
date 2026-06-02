<?php
/**
 * Phase 6 Signal Parity Validator
 * 
 * Compares MT5 signal candidates against Pine reference signals
 * to verify direction match, entry price parity, and signal drift classification.
 * 
 * Usage:
 *   php scripts/signal-parity-validator.php --mt5-file mt5-signals.json --pine-file pine-signals.json --out reports/phase6-signal-parity.json
 */

// Parse CLI arguments
$mt5File = null;
$pineFile = null;
$outFile = 'reports/phase6-signal-parity.json';

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
        'usage' => 'php scripts/signal-parity-validator.php --mt5-file <file> --pine-file <file> [--out <file>]'
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

function readJsonInput(string $file, string $label): array
{
    $contents = file_get_contents($file);
    $data = json_decode($contents, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        echo json_encode([
            'error' => 'Failed to parse JSON input file',
            'input' => $label,
            'message' => json_last_error_msg()
        ], JSON_PRETTY_PRINT) . "\n";
        exit(1);
    }

    return is_array($data) ? $data : [];
}

function extractSignalRecords(array $data): array
{
    foreach (['signals', 'candidates'] as $recordsKey) {
        if (isset($data[$recordsKey]) && is_array($data[$recordsKey])) {
            return $data[$recordsKey];
        }
    }

    return array_values($data) === $data ? $data : [];
}

$mt5Data = readJsonInput($mt5File, 'mt5');
$pineData = readJsonInput($pineFile, 'pine');

// Extract signal records (expected format: array of { id, symbol, direction, entry_price, ... })
// Handles keyed { "signals": [...] }, EA { "candidates": [...] }, and bare array payloads.
$mt5Signals = extractSignalRecords($mt5Data);
$pineSignals = extractSignalRecords($pineData);

// Constants
const EXACT_ENTRY_PIPS = 20;    // Entry within 20 pips = EXACT
const ACCEPTABLE_ENTRY_PIPS = 100; // Entry within 100 pips = DRIFT
const DIRECTION_MISMATCH_PIPS = 1000; // Beyond 100 pips or direction flip = MISMATCH

// Index by symbol + timestamp for lookup (accounting for slight timing diffs)
$mt5Index = [];
$pineIndex = [];

foreach ($mt5Signals as $record) {
    $symbol = $record['symbol'] ?? null;
    $timestamp = $record['created_at'] ?? $record['timestamp'] ?? null;
    
    if ($symbol && $timestamp) {
        $key = "{$symbol}_{$timestamp}";
        if (!isset($mt5Index[$key])) {
            $mt5Index[$key] = [];
        }
        $mt5Index[$key][] = $record;
    }
}

foreach ($pineSignals as $record) {
    $symbol = $record['symbol'] ?? null;
    $timestamp = $record['created_at'] ?? $record['timestamp'] ?? null;
    
    if ($symbol && $timestamp) {
        $key = "{$symbol}_{$timestamp}";
        if (!isset($pineIndex[$key])) {
            $pineIndex[$key] = [];
        }
        $pineIndex[$key][] = $record;
    }
}

// Match records and classify drift
$matches = [];
$directionMatches = 0;
$exactEntries = 0;
$driftEntries = 0;
$mismatches = 0;
$noPineCounterpart = 0;
$noMt5Counterpart = 0;
$totalSignals = 0;

$allKeys = array_unique(array_merge(array_keys($mt5Index), array_keys($pineIndex)));

foreach ($allKeys as $key) {
    $mt5Batch = $mt5Index[$key] ?? [];
    $pineBatch = $pineIndex[$key] ?? [];

    if (empty($mt5Batch)) {
        $noMt5Counterpart += count($pineBatch);
        $mismatches += count($pineBatch);
        foreach ($pineBatch as $signal) {
            $matches[] = [
                'symbol' => $signal['symbol'],
                'timestamp' => $key,
                'status' => 'NO_MT5',
                'pine_direction' => $signal['direction'] ?? null
            ];
        }
        continue;
    }

    if (empty($pineBatch)) {
        $noPineCounterpart += count($mt5Batch);
        $mismatches += count($mt5Batch);
        $totalSignals += count($mt5Batch);
        foreach ($mt5Batch as $signal) {
            $matches[] = [
                'symbol' => $signal['symbol'],
                'timestamp' => $key,
                'status' => 'NO_PINE',
                'mt5_direction' => $signal['direction'] ?? null
            ];
        }
        continue;
    }

    // Match MT5 and Pine signals for this symbol+timestamp
    foreach ($mt5Batch as $mt5Signal) {
        $totalSignals++;
        $mt5Dir = $mt5Signal['direction'] ?? null;
        $mt5Entry = $mt5Signal['entry_price'] ?? null;

        // Find best Pine match (could be multiple; pick first direction match)
        $bestMatch = null;
        foreach ($pineBatch as $pineSignal) {
            $pineDir = $pineSignal['direction'] ?? null;
            $pineEntry = $pineSignal['entry_price'] ?? null;

            if ($mt5Dir === $pineDir) {
                $bestMatch = $pineSignal;
                break;
            }
        }

        if (!$bestMatch) {
            // No Pine signal with matching direction
            $mismatches++;
            $matches[] = [
                'symbol' => $mt5Signal['symbol'],
                'timestamp' => $key,
                'status' => 'MISMATCH',
                'mt5_direction' => $mt5Dir,
                'pine_direction' => $pineBatch[0]['direction'] ?? null,
                'reason' => 'direction_mismatch'
            ];
            continue;
        }

        $pineDir = $bestMatch['direction'] ?? null;
        $pineEntry = $bestMatch['entry_price'] ?? null;

        // Classify entry drift
        if ($mt5Entry !== null && $pineEntry !== null) {
            // Compute pip distance (assuming 4/5 decimal places)
            $pipDistance = abs($mt5Entry - $pineEntry) * 10000;

            if ($pipDistance <= EXACT_ENTRY_PIPS) {
                $directionMatches++;
                $exactEntries++;
                $status = 'EXACT';
            } elseif ($pipDistance <= ACCEPTABLE_ENTRY_PIPS) {
                $directionMatches++;
                $driftEntries++;
                $status = 'DRIFT';
            } else {
                $mismatches++;
                $status = 'MISMATCH';
            }

            $matches[] = [
                'symbol' => $mt5Signal['symbol'],
                'timestamp' => $key,
                'status' => $status,
                'mt5_direction' => $mt5Dir,
                'pine_direction' => $pineDir,
                'mt5_entry' => $mt5Entry,
                'pine_entry' => $pineEntry,
                'entry_drift_pips' => round($pipDistance, 2)
            ];
        } else {
            $directionMatches++;
            $matches[] = [
                'symbol' => $mt5Signal['symbol'],
                'timestamp' => $key,
                'status' => 'DIRECTION_MATCH',
                'mt5_direction' => $mt5Dir,
                'pine_direction' => $pineDir
            ];
        }
    }
}

// Calculate gate metrics
$directionalParityPct = $totalSignals > 0 ? round(($directionMatches / $totalSignals) * 100, 2) : 0;
$entryDriftPct = $totalSignals > 0 ? round((($exactEntries + $driftEntries) / $totalSignals) * 100, 2) : 0;

$gatePass = ($directionalParityPct >= 95) && ($mismatches === 0);

// Build output report
$report = [
    'run_date' => date('Y-m-d'),
    'gate' => $gatePass ? 'PASS' : 'FAIL',
    'direction_parity_pct' => $directionalParityPct,
    'entry_drift_pct' => $entryDriftPct,
    'total_signals' => $totalSignals,
    'direction_matches' => $directionMatches,
    'exact_entries' => $exactEntries,
    'drift_entries' => $driftEntries,
    'mismatches' => $mismatches,
    'no_pine_counterpart' => $noPineCounterpart,
    'no_mt5_counterpart' => $noMt5Counterpart,
    'gate_criteria' => [
        'direction_parity_gte_95_pct' => $directionalParityPct >= 95,
        'mismatches_eq_0' => $mismatches === 0
    ],
    'by_signal' => $matches
];

// Write output
@mkdir(dirname($outFile), 0755, true);
file_put_contents($outFile, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

echo json_encode([
    'status' => 'complete',
    'gate' => $gatePass ? 'PASS' : 'FAIL',
    'direction_parity_pct' => $directionalParityPct,
    'entry_drift_pct' => $entryDriftPct,
    'mismatches' => $mismatches,
    'output_file' => $outFile
], JSON_PRETTY_PRINT) . "\n";

exit($gatePass ? 0 : 1);
?>
