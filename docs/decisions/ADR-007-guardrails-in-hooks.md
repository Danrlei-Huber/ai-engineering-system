# ADR-007: Deterministic guardrails live in hooks; permission denies are scaffolded per project

Status: Accepted (2026-09-22)

## Context
Prompts are guidance, not enforcement. Plugins cannot ship `permissions.deny`; a plugin `settings.json` only supports `agent` and `subagentStatusLine`.

## Decision
Dangerous actions are denied by `PreToolUse` command hooks shipped in the plugin (`block-destructive.sh`, `block-secrets.sh`, `restrict-tester-paths.sh`), written in bash + jq and covered by fixture tests. `/setup-project` additionally writes `permissions.deny` rules into each project's `.claude/settings.json` as a second, independent layer.

## Consequences
Enforcement order is: agent tool set → project permissions → hooks → execution. Hooks run outside the eval sandbox, so eval scores that depend on them are advisory unless run in CI. Bypassing a hook is a deliberate human act, never an agent choice.
