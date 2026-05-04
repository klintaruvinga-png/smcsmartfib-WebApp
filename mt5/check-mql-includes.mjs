import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MT5_DIR = ROOT;
const INCLUDE_PATTERN = /^\s*#include\s*(["<])([^">]+)[">]/;
const errors = [];

async function scanDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDir(entryPath);
      continue;
    }
    if (!entry.name.endsWith('.mq5') && !entry.name.endsWith('.mqh'))
      continue;

    const content = await readFile(entryPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const match = INCLUDE_PATTERN.exec(lines[i]);
      if (!match)
        continue;

      const includePath = match[2].trim();
      const resolved = path.resolve(path.dirname(entryPath), includePath);
      if (!(await exists(resolved))) {
        errors.push(`${path.relative(MT5_DIR, entryPath)}:${i + 1} missing include ${includePath}`);
      }
    }
  }
}

async function exists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch (err) {
    return false;
  }
}

await scanDir(MT5_DIR);
if (errors.length > 0) {
  console.error('MQL include verification failed:');
  for (const error of errors)
    console.error('  -', error);
  process.exit(1);
}
console.log('MQL include verification passed.');
