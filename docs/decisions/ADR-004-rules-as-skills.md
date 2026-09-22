# ADR-004: Rule sets are non-invocable skills preloaded by agents

Status: Accepted (2026-09-22)

## Context
Claude Code supports `.claude/rules/*.md` at project level only; plugins cannot ship rules. The plugin still needs architecture, testing and security rules present in every relevant agent.

## Decision
Each rule set is a skill under `skills/rules/<topic>/SKILL.md` with `user-invocable: false` and `name: rules-<topic>`. Agents list the ones they need under `skills:` in their frontmatter.

## Consequences
Rules travel with the plugin and load only into the agents that need them, keeping the main context small. Rules are versioned like code. A project can still add its own `.claude/rules/`.
