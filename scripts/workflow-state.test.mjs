import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readWorkflowState, writeWorkflowState } from "./workflow-state.js";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeStateFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-state-test-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, ".smc-workflow-state.json");
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}

describe("workflow-state recovery", () => {
  it("recovers a trailing-garbage state file", () => {
    const filePath = makeStateFile(
      `${JSON.stringify(
        {
          state: "PLANNING",
          issue: "Health page",
          editing_locked: true,
          started_at: "2026-05-27T10:00:00.000Z",
        },
        null,
        2,
      )}\n</content>`,
    );

    const state = readWorkflowState(filePath, { autoRepair: true });

    expect(state.state).toBe("PLANNING");
    expect(fs.readFileSync(filePath, "utf8").trim().endsWith("}")).toBe(true);
  });

  it("chooses the most recent valid object when multiple workflow states are concatenated", () => {
    const filePath = makeStateFile(
      `${JSON.stringify(
        {
          state: "PLANNING",
          issue: "Admin Health page issue",
          editing_locked: true,
          started_at: "2026-05-27T12:00:00.000Z",
        },
        null,
        2,
      )}\n${JSON.stringify(
        {
          state: "IMPLEMENTATION_COMPLETE",
          issue: "Active Book stream issue",
          editing_locked: false,
          started_at: "2026-05-27T11:00:00.000Z",
          implementation_completed_at: "2026-05-27T13:00:00.000Z",
        },
        null,
        2,
      )}\n`,
    );

    const state = readWorkflowState(filePath, { autoRepair: true });

    expect(state.state).toBe("IMPLEMENTATION_COMPLETE");
    expect(state.issue).toBe("Active Book stream issue");
  });

  it("writes canonical single-object JSON", () => {
    const filePath = makeStateFile("{}");

    writeWorkflowState(filePath, {
      state: "RESEARCHING",
      workflow: "research-and-plan",
      issue: "Pipeline watcher issue",
      editing_locked: true,
      started_at: "2026-05-27T15:00:00.000Z",
    });

    const raw = fs.readFileSync(filePath, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(raw.match(/\{/g)?.length).toBe(1);
  });
});
