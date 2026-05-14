import assert from "node:assert/strict";
import test from "node:test";

import { buildClaudeShellCommand, shouldUseClaudeShellFallback } from "./pipeline-watcher.js";

const originalPlatform = process.platform;

test.afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

test("uses shell fallback on Windows when no native Claude executable was resolved", () => {
  Object.defineProperty(process, "platform", { value: "win32" });

  assert.equal(shouldUseClaudeShellFallback(null), true);
  assert.equal(
    buildClaudeShellCommand(["--print", "--output-format", "text"]),
    "claude --print --output-format text",
  );
});

test("does not use shell fallback when a native Claude executable is available", () => {
  Object.defineProperty(process, "platform", { value: "win32" });

  assert.equal(
    shouldUseClaudeShellFallback(
      "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe",
    ),
    false,
  );
});

test("does not use shell fallback on non-Windows platforms", () => {
  Object.defineProperty(process, "platform", { value: "linux" });

  assert.equal(shouldUseClaudeShellFallback(null), false);
});
