import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'run-phase4-parity.ps1');

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

  test('documents manual candle export limitation and checks candle files before generation', () => {
    const source = readScript();

    expect(source).toContain('/candles endpoint');
    expect(source).toContain('export-mt5-candles.ps1');
    expect(source).toContain('manual step');
    expect(source).toContain('${sym}_${tf}.json');
    expect(source).toContain('staleness guard in the Pine generator');
  });

  test('uses existing generator and validator with the required file arguments', () => {
    const source = readScript();

    expect(source).toContain('generate-pine-levels-v13.cjs');
    expect(source).toContain('--candle-dir');
    expect(source).toContain('--mt5-file');
    expect(source).toContain('parity-validator.php');
    expect(source).toContain('--pine-file');
    expect(source).toContain('--out');
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
});
