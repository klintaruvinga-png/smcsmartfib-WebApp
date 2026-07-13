# Claude Code CLI: Local OpenRouter Configuration (Private)

This file documents a safe, local-only configuration for using the Claude Code CLI with OpenRouter. It purposely does NOT contain any secrets — replace placeholders with your own keys in your local machine only.

Search tip: include the exact phrase `claude code cli config` when searching the repository to find this file quickly.

## Purpose
- Provide a reproducible, private configuration example for `claude` CLI that uses OpenRouter.
- Ensure the file is not committed or tracked by Git.

## Filenames
- Config doc: `docs/claude-code-cli-config.md` (this file)
- Local Claude settings (example location): `C:\Users\<your-user>\.claude\settings.json`

## Minimal, safe settings example
Do NOT paste your real API key here. Use the example below and replace the placeholder locally.

Example `settings.json` (for local use only):

```
{
  "disableLoginPrompt": true,
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<YOUR_OPENROUTER_API_KEY>",
    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "openai/gpt-oss-120b:free",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "openrouter/free",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "nvidia/nemotron-3-ultra-550b-a55b:free"
  }
}
```

Notes:
- `ANTHROPIC_AUTH_TOKEN` is used here to carry your OpenRouter key.
- Remove/unset any system-wide `ANTHROPIC_API_KEY` if present — having both set causes authentication conflicts.

## How to keep this file private (already done)
- This file is intentionally added to `.gitignore` so it will not be committed.

## Quick PowerShell commands (safe, non-secret)
- Unset `ANTHROPIC_API_KEY` for your User environment (safe — no secret shown):

```powershell
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', '', [System.EnvironmentVariableTarget]::User)
```

- Verify user env variables that contain "ANTHROPIC":

```powershell
Get-ChildItem env: | Where-Object {$_.Name -like "*ANTHROPIC*"} | Select-Object Name, Value
```

## How to test the CLI
- Check version:

```powershell
claude --version
```

- Send a simple chat (non-interactive example depends on your local `claude` version):

```powershell
claude chat
```

If interactive mode opens (alternate buffer), that's expected behavior for some `claude` releases — it indicates the CLI is responsive.

## Discoverability
- To let an agent or collaborator find this file using the repository search, look for the phrase `claude code cli config` (including spaces and lower case). This phrase appears near the top of this document so repository text search will match it.

## Security & privacy
- Do not store or commit API keys in this repo. Replace placeholders locally only.
- Do not attach this file to issues or PRs.

## If something goes wrong
- If the CLI warns that both `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` are set, unset `ANTHROPIC_API_KEY` (see PowerShell command above) and restart your terminal/IDE.

---
Generated: local guidance only. No secrets included.

## Exact local changes applied

After troubleshooting, the following exact, local-only changes were made to get the `claude` CLI working with OpenRouter while avoiding Anthropic OAuth interaction.

- File changed: `./.claude/settings.local.json` (local to the repository/user)
- Action taken: Removed any `ANTHROPIC_API_KEY` entries, kept `ANTHROPIC_AUTH_TOKEN` for OpenRouter, and enabled `disableLoginPrompt`.

Applied (redacted) settings JSON — DO NOT commit your real key; use the placeholder below locally:

```
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "disableLoginPrompt": true,
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<REDACTED_OPENROUTER_KEY>",
    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "nvidia/nemotron-3-ultra-550b-a55b:free",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "openrouter/free",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "openai/gpt-oss-120b:free"
  },
  "permissions": {
    "allow": [ "Read", "Edit", "Write" ]
  }
}
```

Why this works:
- `disableLoginPrompt: true` prevents the CLI from trying to perform Anthropic OAuth / refresh flows.
- `ANTHROPIC_AUTH_TOKEN` carries your OpenRouter API key so the CLI considers itself "logged in" without contacting Anthropic directly.
- `ANTHROPIC_BASE_URL` points the client at OpenRouter instead of the Anthropic cloud.
- Model alias variables (`SONNET`/`OPUS`/`HAIKU`) map internal names the CLI expects to OpenRouter/Open-source model slugs.

Verification steps performed:
1. Confirmed `./.claude/settings.local.json` no longer contains `ANTHROPIC_API_KEY`.
2. Restarted the terminal and launched `claude` — no warning about both `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` being set.
3. Ran `claude --version` and a simple `claude chat` to confirm the CLI starts and is responsive.

If you prefer the CLI to use a machine/user environment variable instead of the local `settings.local.json`, set `ANTHROPIC_AUTH_TOKEN` in your environment and remove it from the file.

Reminder: never commit real API keys. Keep this file local or ensure it is ignored by Git (the repo's `.gitignore` already excludes `.claude/`).
