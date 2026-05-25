import { afterEach, describe, expect, it } from "vitest";

import {
  buildClaudeShellCommand,
  isActivePhaseUpdatePath,
  shouldUseClaudeShellFallback,
} from "./pipeline-watcher.js";

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

describe("pipeline watcher Claude shell fallback", () => {
  it("uses shell fallback on Windows when no native Claude executable was resolved", () => {
    Object.defineProperty(process, "platform", { value: "win32" });

    expect(shouldUseClaudeShellFallback(null)).toBe(true);
    expect(buildClaudeShellCommand(["--print", "--output-format", "text"])).toBe(
      "claude --print --output-format text",
    );
  });

  it("does not use shell fallback when a native Claude executable is available", () => {
    Object.defineProperty(process, "platform", { value: "win32" });

    expect(
      shouldUseClaudeShellFallback(
        "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe",
      ),
    ).toBe(false);
  });

  it("does not use shell fallback on non-Windows platforms", () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    expect(shouldUseClaudeShellFallback(null)).toBe(false);
  });

  it("treats migration archive paths as non-active phase updates", () => {
    expect(
      isActivePhaseUpdatePath(
        ".github/migration/phase-updates/phase0-soak-closeout-final-2026-05-15.md",
      ),
    ).toBe(true);
    expect(
      isActivePhaseUpdatePath(
        ".github/migration/archive/phase-0-updates-prior-to-2026-05-15/phase-0-completion-2026-05-14.md",
      ),
    ).toBe(false);
  });
});
