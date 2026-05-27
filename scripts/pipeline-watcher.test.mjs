import { describe, expect, it } from "vitest";

import {
  buildCodexExecCommand,
  buildCodexVersionCommand,
  isActivePhaseUpdatePath,
} from "./pipeline-watcher.js";

describe("pipeline watcher state detection", () => {
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

describe("pipeline watcher Codex commands", () => {
  it("builds a Codex health-check command without Claude references", () => {
    const command = buildCodexVersionCommand();

    expect(command).toContain("--version");
    expect(command.toLowerCase()).toContain("codex");
    expect(command.toLowerCase()).not.toContain("claude");
  });

  it("builds the Codex exec command with the watcher contract", () => {
    const command = buildCodexExecCommand("C:\\temp\\codex prompt.tmp.md");

    expect(command).toContain("exec");
    expect(command).toContain("--json");
    expect(command).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(command).toContain("\"C:\\temp\\codex prompt.tmp.md\"");
    expect(command.toLowerCase()).toContain("codex");
    expect(command.toLowerCase()).not.toContain("claude");
  });
});
