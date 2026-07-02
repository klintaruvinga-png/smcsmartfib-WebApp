import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'run-phase4-parity.ps1');
const candleExporterPath = path.join(repoRoot, 'scripts', 'export-mt5-candles.ps1');
const packageJsonPath = path.join(repoRoot, 'package.json');

const readScript = () => fs.readFileSync(scriptPath, 'utf8');

describe('run-phase4-parity.ps1 automation contract', () => {
  test('exists and remains compatible with Windows PowerShell 5.1 syntax', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    const source = readScript();

    expect(source).toContain('PowerShell 5.1+');
    expect(source).not.toMatch(/\?\?/);
  });

  test('guards repo/dependencies/auth and supports non-interactive failure', () => {
    const source = readScript();
    const candleExporter = fs.readFileSync(candleExporterPath, 'utf8');

    expect(source).toContain('mt5/FibEngine.mqh');
    expect(source).toMatch(/Get-Command\s+\$cmd/);
    expect(source).toContain('SMC_BACKEND');
    expect(source).toContain('SMC_WP_USER');
    expect(source).toContain('SMC_APP_PW');
    expect(source).toContain('Get-Credential');
    expect(source).toMatch(/\[switch\]\$NoPrompt/);
    expect(source).toContain('foreach ($target in @("Process", "User", "Machine"))');
    expect(candleExporter).toContain('foreach ($target in @("Process", "User", "Machine"))');
  });

  test('requires WordPress auth before any dry-run or full-run mode can continue', () => {
    const source = readScript();

    expect(source.indexOf('Write-Step "Resolving auth"')).toBeLessThan(source.indexOf('if (-not $DryRun)'));
    expect(source).toContain('Write-Fail "Auth env vars SMC_WP_USER / SMC_APP_PW not set and -NoPrompt is active"');
  });

  test('documents backend candle export and checks candle files before generation', () => {
    const source = readScript();

    expect(source).toContain('backend candle endpoint');
    expect(source).toContain('export-mt5-candles.ps1');
    expect(source).toContain('${sym}_${tf}.json');
    expect(source).toContain('staleness guard in the Pine generator');
  });

  test('exports MT5 candles before staleness checks unless explicitly skipped', () => {
    const source = readScript();

    expect(source).toMatch(/\[switch\]\$SkipCandleExport/);
    expect(source).toMatch(/\[int\]\$CandleLimit\s*=/);
    expect(source).toContain('scripts/export-mt5-candles.ps1');
    expect(source).toMatch(/if \(-not \$SkipCandleExport\)/);
    expect(source).toMatch(/CandleDir\s*=\s*\$candleRoot/);
    expect(source).toMatch(/Limit\s*=\s*\$candleExportLimit/);
    expect(source).toMatch(/Timeframes\s*=\s*\[string\[\]\]\$candleExportTimeframes/);
    expect(source.indexOf('export-mt5-candles.ps1')).toBeLessThan(source.indexOf('Test-CandleFiles $candleRoot'));
  });

  test('uses M15 as the only exported candle source while preserving output timeframe selection', () => {
    const source = readScript();

    expect(source).toContain('$candleExportTimeframes = @("M15")');
    expect(source).toContain('Test-CandleFiles $candleRoot $gateSymbols $candleExportTimeframes $referenceUtc');
    expect(source).toMatch(/"--timeframes",\s*\(\$timeframes -join ","\)/);
    expect(source).toMatch(/\$combined \| Where-Object \{ \(\$gateSymbols -contains \$_.symbol\) -and \(\$timeframes -contains \$_.timeframe\) \}/);
  });

  test('keeps expanded audit out of the official gate unless symbols are explicitly overridden', () => {
    const source = readScript();

    expect(source).toContain('$gateSymbols = if ($Symbols.Count -gt 0) { $symbols } else { $officialSymbols }');
    expect(source).toContain('$mt5ExpectedRows = $gateSymbols.Count * $timeframes.Count * 2 * 16');
    expect(source).toMatch(/"--symbols",\s*\(\$gateSymbols -join ","\)/);
    expect(source).toMatch(/Symbols\s*=\s*\[string\[\]\]\$gateSymbols/);
  });

  test('requests enough M15 history for derived higher-timeframe anchors', () => {
    const source = readScript();

    expect(source).toContain('function Get-RequiredM15CandleLimit([string[]]$OutputTimeframes)');
    expect(source).toContain('if ($normalized -contains "D1") { return 60000 }');
    expect(source).toContain('$candleExportLimit = [Math]::Max($CandleLimit, (Get-RequiredM15CandleLimit $timeframes))');
    expect(source).toMatch(/Limit\s*=\s*\$candleExportLimit/);
  });

  test('uses existing generator and validator with the required file arguments', () => {
    const source = readScript();

    expect(source).toContain('generate-pine-levels-v13.cjs');
    expect(source).toContain('--candle-dir');
    expect(source).toContain('--mt5-file');
    expect(source).toContain('--reports-dir');
    expect(source).toMatch(/"--reports-dir",\s*\$reportsRoot/);
    expect(source).toContain('parity-validator.php');
    expect(source).toContain('--pine-file');
    expect(source).toContain('--out');
  });

  test('allows partial Pine output when HTF authority history is optional', () => {
    const source = readScript();

    expect(source).toContain('$pineExpectedRows = $gateSymbols.Count * $timeframes.Count * 2 * 16');
    expect(source).toContain('$pineMinimumRows = $gateSymbols.Count * $timeframes.Count * 1 * 16');
    expect(source).toContain('$pineRequireHtf = [Environment]::GetEnvironmentVariable("PINE_REQUIRE_HTF") -eq "1"');
    expect(source).toContain('Pine levels: $pineRows rows -> $pineLevelsFile (allowed $pineMinimumRows-$pineExpectedRows)');
    expect(source).toContain('Pine partial output accepted');
    expect(source).not.toContain('if ($pineRows -ne $pineExpectedRows) {');
  });

  test('preserves anchor debug artifacts outside the validator level arrays', () => {
    const source = readScript();

    expect(source).toContain('$mt5AnchorDebugFile = Join-Path $reportsRoot "mt5-anchor-debug.json"');
    expect(source).toContain('$pineAnchorDebugFile = Join-Path $reportsRoot "pine-anchor-debug.json"');
    expect(source).toContain('ConvertTo-Mt5AnchorDebugRecords');
    expect(source).toContain('Write-JsonFile $mt5AnchorDebugFile');
    expect(source).toContain('Anchor debug artifacts');
  });

  test('adds anchor-debug comparison details to Markdown reports for critical groups', () => {
    const source = readScript();

    expect(source).toContain('Format-AnchorDebugSummaryMarkdown');
    expect(source).toContain('## Anchor Debug Summary');
    expect(source).toContain('Build-AnchorDebugIndex');
    expect(source).toContain('Anchor High');
    expect(source).toContain('Components');
  });

  test('captures one canonical run timestamp and passes it to Node and PHP tools', () => {
    const source = readScript();

    expect(source).toContain('$runInstant = [DateTimeOffset]::UtcNow');
    expect(source).toMatch(/\$runTs\s*=\s*\$runInstant\.ToString\("o"\)/);
    expect(source).toMatch(/\$timestamp\s*=\s*\$runInstant\.ToString\("yyyy-MM-dd_HHmmss"\)/);
    expect(source).toMatch(/"--run-ts",\s*\$runTs/);
    expect(source.match(/"--run-ts",\s*\$runTs/g)).toHaveLength(2);
    expect(source).not.toContain('Get-Date -Format "yyyy-MM-dd_HHmmss"');
  });

  test('writes timestamped gate artifacts and updates the tracker', () => {
    const source = readScript();

    expect(source).toContain('phase4-gate-${timestamp}.json');
    expect(source).toContain('phase4-gate-${timestamp}.md');
    expect(source).toContain('reports/fib-parity-validation.md');
    expect(source).toContain('Add-Content');
  });

  test('supports expanded audit and dry-run semantics', () => {
    const source = readScript();

    expect(source).toMatch(/\[switch\]\$ExpandedAudit/);
    expect(source).toMatch(/\[switch\]\$DryRun/);
    expect(source).toContain('BTCUSD');
    expect(source).toContain('NAS100');
    expect(source).toContain('skipping MT5 export');
    expect(source).toContain('skipping validator');
  });

  test('package scripts expose short Windows PowerShell parity aliases', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    expect(pkg.scripts.parity).toBe('powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-phase4-parity.ps1');
    expect(pkg.scripts['parity:dry']).toBe('powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-phase4-parity.ps1 -DryRun');
    expect(pkg.scripts['parity:expanded']).toBe('powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-phase4-parity.ps1 -ExpandedAudit');
  });
});

describe('export-mt5-candles.ps1 automation contract', () => {
  test('exports authenticated MT5 candle JSON files for Phase 4 symbols and timeframes', () => {
    expect(fs.existsSync(candleExporterPath)).toBe(true);
    const source = fs.readFileSync(candleExporterPath, 'utf8');

    expect(source).toContain('SMC_BACKEND');
    expect(source).toContain('SMC_WP_USER');
    expect(source).toContain('SMC_APP_PW');
    expect(source).toContain('/wp-json/sniper/v1/market-data/candles');
    expect(source).toContain('${sym}_${tf}.json');
    expect(source).toContain('M15');
    expect(source).toContain('H1');
    expect(source).toContain('H4');
    expect(source).toContain('D1');
    expect(source).toContain('NoPrompt');
    expect(source).toMatch(/time\/open\/high\/low\/close/);
    expect(source).toContain('[Math]::Min(100000, $Limit)');
  });
});

describe('Patch 1 — candle lineage columns in anchor debug Markdown report', () => {
  test('New-Mt5AnchorDebugRecord preserves MT5 lineage fields from endpoint debug', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'run-phase4-parity.ps1'),
      'utf8'
    );
    expect(source).toContain('candle_lineage        = Get-ObjectPropertyValue $Debug "candle_lineage"');
    expect(source).toContain('source_period         = Get-ObjectPropertyValue $Debug "source_period"');
    expect(source).toContain('source_feed_bars      = Get-ObjectPropertyValue $Debug "source_feed_bars"');
  });

  test('Format-AnchorDebugSummaryMarkdown emits a Candle Lineage column header', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'run-phase4-parity.ps1'),
      'utf8'
    );
    expect(source).toContain('Candle Lineage');
  });

  test('Format-AnchorDebugSummaryMarkdown reads candle_lineage from anchor debug objects', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'run-phase4-parity.ps1'),
      'utf8'
    );
    expect(source).toContain('"candle_lineage"');
  });

  test('Format-AnchorDebugSummaryMarkdown reads source_feed_bars from anchor debug objects', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'run-phase4-parity.ps1'),
      'utf8'
    );
    expect(source).toContain('"source_feed_bars"');
  });

  test('Format-AnchorDebugSummaryMarkdown appends LINEAGE_MISMATCH tag when lineage fields differ', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'run-phase4-parity.ps1'),
      'utf8'
    );
    expect(source).toContain('LINEAGE_MISMATCH');
    // Delta row must have an empty cell in the Lineage column (not a numeric delta).
    expect(source).toContain('"| Delta | |');
  });

  test('Format-AnchorDebugSummaryMarkdown falls back to debug_source when candle_lineage is absent', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'run-phase4-parity.ps1'),
      'utf8'
    );
    expect(source).toContain('debug_source');
  });

  test('-BackendMode pine_compatible appends mode=pine_compatible to fib-levels URL', () => {
    const source = readScript();

    expect(source).toMatch(/\[ValidateSet\("direct",\s*"pine_compatible"\)/);
    expect(source).toMatch(/\[string\]\$BackendMode\s*=\s*"direct"/);
    expect(source).toContain('&mode=$BackendMode');
  });

  test('default BackendMode is direct for backward compatibility', () => {
    const source = readScript();

    // Default must remain "direct" so existing callers are unaffected.
    expect(source).toMatch(/\$BackendMode\s*=\s*"direct"/);
  });

  test('official Phase 4 gate documents -BackendMode pine_compatible', () => {
    const source = readScript();

    // Help block or comments must mention the official gate command.
    expect(source).toContain('-BackendMode pine_compatible');
    // And the example should use -NoPrompt so CI/CD can run it unattended.
    expect(source).toMatch(/-BackendMode\s+pine_compatible.*-NoPrompt|-NoPrompt.*-BackendMode\s+pine_compatible/s);
  });

});
