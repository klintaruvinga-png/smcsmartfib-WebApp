import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'run-phase4-parity.ps1');
const candleExporterPath = path.join(repoRoot, 'scripts', 'export-mt5-candles.ps1');
const packageJsonPath = path.join(repoRoot, 'package.json');

describe('run-phase4-parity.ps1 automation contract', () => {
  const readScript = () => fs.readFileSync(scriptPath, 'utf8');

  test('exists and remains compatible with Windows PowerShell 5.1 syntax', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    const source = readScript();

    expect(source).toContain('PowerShell 5.1+');
    expect(source).not.toMatch(/\?\?/);
  });

  test('guards repo/dependencies/auth and supports non-interactive failure', () => {
    const source = readScript();

    expect(source).toContain('mt5/FibEngine.mqh');
    expect(source).toMatch(/Get-Command\s+\$cmd/);
    expect(source).toContain('SMC_BACKEND');
    expect(source).toContain('SMC_WP_USER');
    expect(source).toContain('SMC_APP_PW');
    expect(source).toContain('Get-Credential');
    expect(source).toMatch(/\[switch\]\$NoPrompt/);
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
    expect(source).toMatch(/"-CandleDir",\s*\$candleRoot/);
    expect(source).toMatch(/"-Limit",\s*\$CandleLimit/);
    expect(source.indexOf('export-mt5-candles.ps1')).toBeLessThan(source.indexOf('Test-CandleFiles $candleRoot'));
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
  });
});
