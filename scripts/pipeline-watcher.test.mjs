import { describe, expect, it } from "vitest";

import {
<<<<<<< Updated upstream
  buildCodexExecCommand,
  buildCodexVersionCommand,
=======
  buildClaudeShellCommand,
  extractUsablePlanFromCodexOutput,
>>>>>>> Stashed changes
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

  it("extracts a valid plan from captured Codex output", () => {
    const output = `
1. Issue validation
2. Implementation contract
3. Patch sequence
4. Regression guards
5. Non-goals
6. Risk assessment
7. Test requirements
8. Implementation handoff
`;

    expect(extractUsablePlanFromCodexOutput(output)).toContain("1. Issue validation");
  });

  it("rejects captured Codex output that is not a usable plan", () => {
    expect(extractUsablePlanFromCodexOutput("Stopped\nNo patch was applied")).toBeNull();
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
