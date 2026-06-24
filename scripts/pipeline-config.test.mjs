import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadPipelineConfig,
  resolvePipelineContext,
  resolveRepoRoot,
} from "./pipeline-config.js";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeRepo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-config-repo-"));
  tempDirs.push(dir);

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }

  return dir;
}

describe("pipeline config", () => {
  it("resolves an explicit --repo target", () => {
    const repo = makeRepo();

    expect(resolveRepoRoot(["--repo", repo], {})).toBe(path.resolve(repo));
  });

  it("resolves all runtime paths inside the target repo", () => {
    const repo = makeRepo();
    const context = resolvePipelineContext(["--repo", repo], {});

    expect(context.repoRoot).toBe(path.resolve(repo));
    expect(context.paths.stateFile).toBe(path.join(repo, ".smc-workflow-state.json"));
    expect(context.paths.planPromptFile).toBe(
      path.join(repo, ".github", "prompts", "claude-plan-prompt.md"),
    );
    expect(context.paths.runnerPidFile).toBe(path.join(repo, "reports", ".pipeline-runner.pid"));
  });

  it("loads .agent-pipeline config overrides from the target repo", () => {
    const repo = makeRepo({
      ".agent-pipeline/config.json": JSON.stringify({
        reportsDir: ".pipeline-reports",
        branchPrefix: "agent",
        claudeBinary: "claude-local",
      }),
    });

    const config = loadPipelineConfig(repo);
    const context = resolvePipelineContext(["--repo", repo], {});

    expect(config.branchPrefix).toBe("agent");
    expect(config.claudeBinary).toBe("claude-local");
    expect(context.paths.runnerLogFile).toBe(
      path.join(repo, ".pipeline-reports", "pipeline-runner.log"),
    );
  });
});
