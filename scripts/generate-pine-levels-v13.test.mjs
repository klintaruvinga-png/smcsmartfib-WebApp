import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const generatorPath = path.join(repoRoot, 'scripts', 'generate-pine-levels-v13.cjs');

describe('generate-pine-levels-v13.cjs output contract', () => {
  const readGenerator = () => fs.readFileSync(generatorPath, 'utf8');

  test('supports routing Pine artifacts to the caller-selected reports directory', () => {
    const source = readGenerator();

    expect(source).toContain("getArg('--reports-dir')");
    expect(source).toMatch(/const REPORTS_DIR\s*=\s*path\.resolve\(getArg\('--reports-dir'\)/);
    expect(source).toContain("path.join(REPORTS_DIR, 'pine-levels.json')");
    expect(source).toContain("path.join(REPORTS_DIR, 'pine-levels.metadata.json')");
  });

  test('defaults both MT5 input and Pine output to the same phase4 report directory', () => {
    const source = readGenerator();

    expect(source).toMatch(/const MT5_FILE\s*=\s*path\.resolve\(getArg\('--mt5-file'\) \|\| path\.join\(REPORTS_DIR, 'mt5-levels\.json'\)\)/);
    expect(source).not.toMatch(/const OUTPUT_LEVELS\s*=\s*path\.join\(REPO_ROOT, 'reports', 'phase4-parity', 'pine-levels\.json'\)/);
  });

  test('uses caller supplied run timestamp for generated metadata', () => {
    const source = readGenerator();

    expect(source).toContain("getArg('--run-ts') || new Date().toISOString()");
    expect(source).toMatch(/const RUN_TS\s*=/);
    expect(source).toContain('generated_at: RUN_TS');
    expect(source).not.toContain('generated_at: new Date().toISOString()');
  });

  test('derives higher-timeframe helper feeds from M15 candles only', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smc-pine-levels-'));
    const candleDir = path.join(tempRoot, 'data');
    const reportsDir = path.join(tempRoot, 'reports');
    fs.mkdirSync(candleDir, { recursive: true });
    fs.mkdirSync(reportsDir, { recursive: true });

    const candles = [];
    const start = Date.UTC(2026, 1, 1, 0, 0, 0);
    const end = Date.UTC(2026, 5, 4, 0, 0, 0);
    let i = 0;
    for (let timeMs = start; timeMs <= end; timeMs += 15 * 60 * 1000) {
      const base = 1.1 + (i % 400) * 0.00001;
      candles.push({
        time: new Date(timeMs).toISOString(),
        open: base,
        high: base + 0.0015,
        low: base - 0.0015,
        close: base + 0.0002,
      });
      i++;
    }

    fs.writeFileSync(path.join(candleDir, 'EURUSD_M15.json'), JSON.stringify(candles));
    const mt5File = path.join(reportsDir, 'mt5-levels.json');
    fs.writeFileSync(mt5File, '[]');
    const mt5Mtime = new Date(end + 60 * 1000);
    fs.utimesSync(mt5File, mt5Mtime, mt5Mtime);

    execFileSync(process.execPath, [
      generatorPath,
      '--candle-dir', candleDir,
      '--mt5-file', mt5File,
      '--reports-dir', reportsDir,
      '--run-ts', '2026-06-04T00:00:00.000Z',
      '--symbols', 'EURUSD',
      '--timeframes', 'H1',
    ], { encoding: 'utf8' });

    expect(fs.existsSync(path.join(candleDir, 'EURUSD_H1.json'))).toBe(false);
    const levels = JSON.parse(fs.readFileSync(path.join(reportsDir, 'pine-levels.json'), 'utf8'));
    expect(levels).toHaveLength(32);
    expect(new Set(levels.map((row) => row.timeframe))).toEqual(new Set(['H1']));
  });
});
