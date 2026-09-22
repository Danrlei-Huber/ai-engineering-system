# ADR-002: Workflows are orchestrator skills; agents are roles

Status: Accepted (2026-09-22)

## Context
A pipeline such as research → plan → approve → implement → test → review could be expressed as declarative YAML with a custom runner, or as prose in a skill that dispatches subagents.

## Decision
Each workflow is a `SKILL.md` that runs in the main session and dispatches role agents in a fixed order documented as a state table inside the skill. Agents are reusable components; workflows compose them. No custom runtime.

## Consequences
Zero moving parts beyond Claude Code itself. Pipelines are auditable by reading the skill and testable with `claude plugin eval` (`tool_used`, `tool_order`). The trade-off is that the pipeline is structured prose, not machine-readable data; revisit if more than a handful of workflows exist.
