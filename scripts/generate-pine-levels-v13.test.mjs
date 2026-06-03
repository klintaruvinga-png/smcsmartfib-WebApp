import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
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
});
