import fs from "node:fs";
import path from "node:path";

export const DEFAULT_PIPELINE_CONFIG = {
  reportsDir: "reports",
  stateFile: ".smc-workflow-state.json",
  lockFile: "reports/.pipeline-lock.json",
  archiveDir: "reports/archive",
  researchArtifact: "reports/copilot-research.md",
  planArtifact: "reports/claude-plan.md",
  planMetadataArtifact: "reports/claude-plan.meta.json",
  implementationArtifact: "reports/claude-implementation.md",
  implementationMetadataArtifact: "reports/claude-implementation.meta.json",
  implementationFailedArtifact: "reports/.claude-implementation-failed.json",
  planPrompt: ".github/prompts/claude-plan-prompt.md",
  implementPrompt: ".github/prompts/claude-implement-prompt.md",
  lastMessageArtifact: "reports/claude-last-message.txt",
  resetArtifact: "reports/.pipeline-reset-requested",
  planHardeningBlockedArtifact: "reports/.claude-plan-hardening-blocked.json",
  branchPrefix: "claude",
  claudeBinary: process.platform === "win32" ? "claude.cmd" : "claude",
};

export function readArgValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return null;
  }
  return args[index + 1];
}

export function resolveRepoRoot(args = process.argv.slice(2), env = process.env) {
  const explicitRepo = readArgValue(args, "--repo") ?? env.AGENT_PIPELINE_REPO;
  return path.resolve(explicitRepo || process.cwd());
}

export function readOptionalJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

export function loadPipelineConfig(repoRoot) {
  const configured =
    readOptionalJson(path.join(repoRoot, ".agent-pipeline", "config.json")) ??
    readOptionalJson(path.join(repoRoot, ".claude", "pipeline-config.json")) ??
    {};

  return { ...DEFAULT_PIPELINE_CONFIG, ...configured };
}

export function resolveFromRepo(repoRoot, filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

export function resolvePipelineContext(args = process.argv.slice(2), env = process.env) {
  const repoRoot = resolveRepoRoot(args, env);
  const config = loadPipelineConfig(repoRoot);
  const reportsDir = resolveFromRepo(repoRoot, config.reportsDir);

  return {
    repoRoot,
    config,
    paths: {
      reportsDir,
      stateFile: resolveFromRepo(repoRoot, config.stateFile),
      lockFile: resolveFromRepo(repoRoot, config.lockFile),
      archiveDir: resolveFromRepo(repoRoot, config.archiveDir),
      researchFile: resolveFromRepo(repoRoot, config.researchArtifact),
      planFile: resolveFromRepo(repoRoot, config.planArtifact),
      planMetadataFile: resolveFromRepo(repoRoot, config.planMetadataArtifact),
      implementationFile: resolveFromRepo(repoRoot, config.implementationArtifact),
      implementationMetadataFile: resolveFromRepo(repoRoot, config.implementationMetadataArtifact),
      implementationFailedFile: resolveFromRepo(repoRoot, config.implementationFailedArtifact),
      planPromptFile: resolveFromRepo(repoRoot, config.planPrompt),
      implementationPromptFile: resolveFromRepo(repoRoot, config.implementPrompt),
      lastMessageFile: resolveFromRepo(repoRoot, config.lastMessageArtifact),
      resetFile: resolveFromRepo(repoRoot, config.resetArtifact),
      planHardeningBlockedFile: resolveFromRepo(repoRoot, config.planHardeningBlockedArtifact),
      runnerPidFile: path.join(reportsDir, ".pipeline-runner.pid"),
      runnerLogFile: path.join(reportsDir, "pipeline-runner.log"),
    },
  };
}
