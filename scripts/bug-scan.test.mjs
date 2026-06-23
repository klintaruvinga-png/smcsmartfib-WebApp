import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const bugScanPath = path.join(repoRoot, 'scripts', 'bug-scan.ps1');
const parityPath = path.join(repoRoot, 'scripts', 'run-phase4-parity.ps1');

describe('bug-scan.ps1 automation contract', () => {
  const readBugScan = () => fs.readFileSync(bugScanPath, 'utf8');

  test('bounds fragile-pattern scanning to source roots', () => {
    const source = readBugScan();

    expect(source).toContain('$scanRoots = @(');
    expect(source).toContain('"src"');
    expect(source).toContain('"mt5"');
    expect(source).toContain('"wordpress"');
    expect(source).not.toMatch(/Get-ChildItem\s+-Recurse\s+-Include/);
  });

  test('excludes generated dependency and report directories from recursive scans', () => {
    const source = readBugScan();

    expect(source).toContain('node_modules|dist|reports|data|\\.git|\\.tanstack|\\.wrangler');
  });

  test('does not pass unsupported dry-run flags to the Pine generator', () => {
    const source = readBugScan();

    expect(source).toContain('node scripts/generate-pine-levels-v13.cjs');
    expect(source).not.toContain('--dry-run');
  });
});

describe('run-phase4-parity.ps1 JSON writer contract', () => {
  test('constructs UTF8Encoding with PowerShell-compatible argument binding', () => {
    const source = fs.readFileSync(parityPath, 'utf8');

    expect(source).toContain('New-Object System.Text.UTF8Encoding -ArgumentList $false');
    expect(source).not.toContain('New-Object System.Text.UTF8Encoding $false');
  });

  test('binds anchor-debug level arrays by name instead of positional expansion', () => {
    const source = fs.readFileSync(parityPath, 'utf8');

    expect(source).toContain(
      'New-Mt5AnchorDebugRecord -Symbol $parts[0] -Timeframe $parts[1] -Family $parts[2] -Levels $levelRows -Debug $null'
    );
    expect(source).toContain(
      'New-Mt5AnchorDebugRecord -Symbol $Symbol -Timeframe $tf -Family $family -Levels @($familyProp.Value) -Debug $familyDebug'
    );
    expect(source).toContain('$groups[$key] = @()');
  });
});
