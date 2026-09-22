# ADR-001: Distribute the engineering system as a Claude Code plugin

Status: Accepted (2026-09-22)

## Context
The same agents, workflows and guardrails must serve several projects (farmvision, fishvision, otqshield). Copying `.claude/` into each repo would diverge; a meta-repo would couple every project to one directory.

## Decision
This repository is a Claude Code plugin (`.claude-plugin/plugin.json`). Projects install it (`--plugin-dir` for development, a marketplace entry for installation) and keep only a short `CLAUDE.md`, `.claude/settings.json` and `.ai-engineering/project.yaml`.

## Consequences
Updates propagate by bumping the plugin version. Plugin and project versions are independent; each project records the plugin version it was set up with. Plugins cannot ship `rules/` or `permissions.deny`, which drives ADR-004 and ADR-007.
