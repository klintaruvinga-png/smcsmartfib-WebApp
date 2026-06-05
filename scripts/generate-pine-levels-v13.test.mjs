import { describe, expect, test } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const generatorPath = path.join(repoRoot, 'scripts', 'generate-pine-levels-v13.cjs');

function writeShortMonthlyHistoryFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smc-pine-partial-htf-'));
  const candleDir = path.join(tempRoot, 'data');
  const reportsDir = path.join(tempRoot, 'reports');
  fs.mkdirSync(candleDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });

  const candles = [];
  const start = Date.UTC(2026, 4, 4, 0, 0, 0);
  const end = Date.UTC(2026, 5, 5, 0, 0, 0);
  let i = 0;
  for (let timeMs = start; timeMs <= end; timeMs += 15 * 60 * 1000) {
    const dayOffset = Math.floor(i / 96);
    const base = 1.1 + dayOffset * 0.0002 + (i % 96) * 0.000002;
    candles.push({
      time: new Date(timeMs).toISOString(),
      open: base,
      high: base + 0.004,
      low: base - 0.004,
      close: base + 0.0001,
    });
    i++;
  }

  fs.writeFileSync(path.join(candleDir, 'EURUSD_M15.json'), JSON.stringify(candles));
  const mt5File = path.join(reportsDir, 'mt5-levels.json');
  fs.writeFileSync(mt5File, '[]');
  const mt5Mtime = new Date(end + 60 * 1000);
  fs.utimesSync(mt5File, mt5Mtime, mt5Mtime);

  return { candleDir, reportsDir, mt5File };
}

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

  test('writes standalone anchor debug records without changing level rows', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smc-pine-anchor-debug-'));
    const candleDir = path.join(tempRoot, 'data');
    const reportsDir = path.join(tempRoot, 'reports');
    fs.mkdirSync(candleDir, { recursive: true });
    fs.mkdirSync(reportsDir, { recursive: true });

    const candles = [];
    const start = Date.UTC(2026, 4, 18, 0, 0, 0);
    const end = Date.UTC(2026, 5, 8, 0, 0, 0);
    let i = 0;
    for (let timeMs = start; timeMs <= end; timeMs += 15 * 60 * 1000) {
      const dayOffset = Math.floor(i / 96);
      const base = 1.12 + dayOffset * 0.002 + (i % 96) * 0.00001;
      candles.push({
        time: new Date(timeMs).toISOString(),
        open: base,
        high: base + 0.003,
        low: base - 0.003,
        close: base + 0.0001,
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
      '--run-ts', '2026-06-05T00:00:00.000Z',
      '--symbols', 'EURUSD',
      '--timeframes', 'M15',
    ], { encoding: 'utf8' });

    const levels = JSON.parse(fs.readFileSync(path.join(reportsDir, 'pine-levels.json'), 'utf8'));
    expect(levels).toHaveLength(32);
    expect(levels[0]).toEqual(expect.objectContaining({
      symbol: 'EURUSD',
      timeframe: 'M15',
      family: expect.any(String),
      ratio: expect.any(Number),
      price: expect.any(Number),
    }));
    expect(levels[0]).not.toHaveProperty('anchor_debug');

    const debug = JSON.parse(fs.readFileSync(path.join(reportsDir, 'pine-anchor-debug.json'), 'utf8'));
    expect(debug).toHaveLength(2);

    const ltf = debug.find((row) => row.family === 'LTF_SF');
    expect(ltf).toEqual(expect.objectContaining({
      symbol: 'EURUSD',
      timeframe: 'M15',
      family: 'LTF_SF',
      session_tf: 'Daily',
      authority_tf: 'Weekly',
      compression_threshold: 0.002,
      anchor_high: expect.any(Number),
      anchor_low: expect.any(Number),
      anchor_range: expect.any(Number),
    }));
    expect(ltf.components.map((component) => component.slot)).toEqual(['F1', 'F2', 'F3']);
    expect(ltf.components[0]).toEqual(expect.objectContaining({
      key: expect.any(Number),
      high: expect.any(Number),
      low: expect.any(Number),
      range: expect.any(Number),
      compression_pass: true,
      weight: expect.any(Number),
      candle_count: expect.any(Number),
      first_candle: expect.stringMatching(/^2026-/),
      last_candle: expect.stringMatching(/^2026-/),
    }));

    const htf = debug.find((row) => row.family === 'HTF_AF');
    expect(htf).toEqual(expect.objectContaining({
      source: 'auth_f1',
      key: expect.any(Number),
      high: expect.any(Number),
      low: expect.any(Number),
      candle_count: expect.any(Number),
      first_candle: expect.stringMatching(/^2026-/),
      last_candle: expect.stringMatching(/^2026-/),
    }));
  });

  test('rounds jittered M15 source times before assigning aggregation buckets', () => {
    const source = readGenerator();
    const helperStart = source.includes('function roundToNearestMinuteMs')
      ? source.indexOf('function roundToNearestMinuteMs')
      : source.indexOf('function bucketStartMs');
    const helperEnd = source.indexOf('function aggregateCandles');
    const helperSource = source.slice(helperStart, helperEnd);
    const bucketStartMs = Function(`${helperSource}; return bucketStartMs;`)();

    const bucketIso = (iso) => new Date(bucketStartMs(Date.parse(iso), 'M15')).toISOString();

    expect(bucketIso('2026-06-04T11:44:58Z')).toBe('2026-06-04T11:45:00.000Z');
    expect(bucketIso('2026-06-04T11:44:59Z')).toBe('2026-06-04T11:45:00.000Z');
    expect(bucketIso('2026-06-04T11:45:08Z')).toBe('2026-06-04T11:45:00.000Z');
    expect(bucketIso('2026-06-04T11:30:03Z')).toBe('2026-06-04T11:30:00.000Z');
  });

  test('skips HTF_AF rows by default when LTF_SF is computable but authority history is incomplete', () => {
    const { candleDir, reportsDir, mt5File } = writeShortMonthlyHistoryFixture();

    const result = spawnSync(process.execPath, [
      generatorPath,
      '--candle-dir', candleDir,
      '--mt5-file', mt5File,
      '--reports-dir', reportsDir,
      '--run-ts', '2026-06-05T00:00:00.000Z',
      '--symbols', 'EURUSD',
      '--timeframes', 'H4',
    ], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('WARN: partial output');
    const levels = JSON.parse(fs.readFileSync(path.join(reportsDir, 'pine-levels.json'), 'utf8'));
    expect(levels).toHaveLength(16);
    expect(new Set(levels.map((row) => row.family))).toEqual(new Set(['LTF_SF']));
  });

  test('keeps HTF_AF as a hard requirement when PINE_REQUIRE_HTF is enabled', () => {
    const { candleDir, reportsDir, mt5File } = writeShortMonthlyHistoryFixture();

    expect(() => execFileSync(process.execPath, [
      generatorPath,
      '--candle-dir', candleDir,
      '--mt5-file', mt5File,
      '--reports-dir', reportsDir,
      '--run-ts', '2026-06-05T00:00:00.000Z',
      '--symbols', 'EURUSD',
      '--timeframes', 'H4',
    ], {
      encoding: 'utf8',
      env: { ...process.env, PINE_REQUIRE_HTF: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })).toThrow(/PINE_REQUIRE_HTF=1/);
  });
});
