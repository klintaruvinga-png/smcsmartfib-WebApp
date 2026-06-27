import { describe, expect, it } from "vitest";

import {
  extractUsablePlanFromClaudeOutput,
  buildClaudeImplementationPrompt,
  buildClaudeExecArgs,
  buildClaudeVersionArgs,
  isActivePhaseUpdatePath,
  selectOpenReadyPR,
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

  it("extracts a valid plan from captured Claude output", () => {
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

    expect(extractUsablePlanFromClaudeOutput(output)).toContain("1. Issue validation");
  });

  it("rejects captured Claude output that is not a usable plan", () => {
    expect(extractUsablePlanFromClaudeOutput("Stopped\nNo patch was applied")).toBeNull();
  });
});

describe("pipeline watcher Claude commands", () => {
  it("builds Claude health-check args without Codex references", () => {
    const args = buildClaudeVersionArgs();

    expect(args).toContain("--version");
  });

  it("builds the Claude exec args with the watcher contract", () => {
    const args = buildClaudeExecArgs("/tmp/prompt.md");

    expect(args).toContain("exec");
    expect(args).toContain("--json");
    expect(args).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args).toContain("/tmp/prompt.md");
  });

  it("builds the implementation prompt with an explicit non-draft PR command", () => {
    const prompt = buildClaudeImplementationPrompt({
      issue: "Patch the update runner",
      promptText: "Base prompt",
    });

    expect(prompt).toContain("gh pr create --fill");
    expect(prompt).toContain("Do not pass --draft");
    expect(prompt).toContain("gh pr ready");
  });

  it("selects only open non-draft PRs as implementation-complete PRs", () => {
    expect(selectOpenReadyPR([{ number: 101, isDraft: true }])).toBeNull();
    expect(
      selectOpenReadyPR([
        { number: 101, isDraft: true },
        { number: 102, isDraft: false },
      ]),
    ).toEqual({ number: 102, isDraft: false });
  });
});
