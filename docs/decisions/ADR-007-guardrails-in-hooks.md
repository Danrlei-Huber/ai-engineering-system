# ADR-007: Deterministic guardrails live in hooks; permission denies are scaffolded per project

Status: Accepted (2026-09-22)

## Context
Prompts are guidance, not enforcement. Plugins cannot ship `permissions.deny`; a plugin `settings.json` only supports `agent` and `subagentStatusLine`.

## Decision
Dangerous actions are denied by `PreToolUse` command hooks shipped in the plugin (`block-destructive.sh`, `block-secrets.sh`, `restrict-tester-paths.sh`), written in bash + jq and covered by fixture tests. `restrict-tester-paths.sh` is wired plugin-wide in `hooks/hooks.json` and gates itself on the calling agent's identity from the hook input (the top-level `agent_type` field), so it only enforces the test-path restriction when the tester subagent is the one calling Edit/Write/MultiEdit; every other caller, including the main session and other subagents, passes through unaffected. `/setup-project` additionally writes `permissions.deny` rules into each project's `.claude/settings.json` as a second, independent layer.

## Consequences
Enforcement order is: agent tool set → project permissions → hooks → execution. Plugin hooks run inside `claude plugin eval` only when `--trust-plugin` is passed; without it the security cases fail. The `agent_type` hook-input field was verified on Claude Code 2.1.280 and must be re-verified on CLI upgrades. Bypassing a hook is a deliberate human act, never an agent choice.
