import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MT5_DIR = ROOT;
const INCLUDE_PATTERN = /^s*#include\s*(["<])([^">]+)[">]/;
const FIB_ENGINE = path.join(MT5_DIR, "FibEngine.mqh");
const errors = [];

// Split into lines, stripping any trailing CR so CRLF and LF both work.
function toLines(content) {
  return content.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
}

// Regression guards for the EA fib-payload contract (see PR #444).
// These catch the exact break classes that previously blocked MetaEditor
// compilation and produced a JSON shape the backend zod schema rejects.
async function checkFibEngineGuards() {
  let content;
  try {
    content = await readFile(FIB_ENGINE, "utf8");
  } catch {
    errors.push(`FibEngine guard: missing ${path.relative(MT5_DIR, FIB_ENGINE)}`);
    return;
  }
  const lines = toLines(content);

  // Guard 1: no `int userId` in FibEngine. The EA passes a UUID string
  // (wpUserId); a function declaring `int userId` is a hard MQL5 compile
  // error at the call site.
  lines.forEach((line, i) => {
    if (/\bint\s+userId\b/.test(line)) {
      errors.push(
        `FibEngine guard: int userId at FibEngine.mqh:${i + 1} (must be string; EA passes UUID wpUserId)`,
      );
    }
  });

  // Guard 2: no per-level `"family"` JSON key. The backend reads family from
  // the ltf_sf/htf_af parent key and strips unknown fields, so a `family`
  // field inside each level object is dead weight (and breaks if the schema
  // is ever tightened). The in-memory FibLevelOut.family struct member is
  // allowed; only the quoted JSON key is banned.
  lines.forEach((line, i) => {
    if (/"family"/.test(line)) {
      errors.push(
        `FibEngine guard: quoted "family" JSON key at FibEngine.mqh:${i + 1} (backend derives family from parent key)`,
      );
    }
  });
}

async function scanDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDir(entryPath);
      continue;
    }
    if (!entry.name.endsWith(".mq5") && !entry.name.endsWith(".mqh")) continue;

    const content = await readFile(entryPath, "utf8");
    const lines = toLines(content);
    for (let i = 0; i < lines.length; i++) {
      const match = INCLUDE_PATTERN.exec(lines[i]);
      if (!match) continue;

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
await checkFibEngineGuards();
if (errors.length > 0) {
  console.error("MQL verification failed:");
  for (const error of errors) console.error("  -", error);
  process.exit(1);
}
console.log("MQL verification passed (includes + FibEngine guards).");
