# ADR-003: Least-privilege tool boundaries between agents

Status: Accepted (2026-09-22)

## Context
An agent with every tool can implement, review its own work and trigger external automations in one breath. That removes independence from the review and makes side effects hard to trace.

## Decision
Each agent gets the minimum tool set for its role. Agents that write code (backend, tester) never review; the reviewer and the architect never edit. Only `automation` holds n8n tools. Only `research` and `architect` hold RAG tools. The tester may write only test paths, enforced by a plugin hook that applies only when the calling agent is the tester (agent-frontmatter hooks are ignored for plugin agents in Claude Code 2.1.x).

## Consequences
The tester's Bash is guarded for write shapes by a second plugin hook (`restrict-tester-bash.sh`), so the edit-path restriction cannot simply be routed around the shell; the reviewer's Bash remains prompt-only for now. That hook is a deny-list of the common write shapes, not a sandbox -- `curl -o`, `wget -O`, interpreter one-liners and anything else it has no pattern for still get through, so the reviewer stays the second line of defence rather than a formality. Some tasks need two agents where one would do. In exchange, the reviewer's verdict is independent, external side effects come from exactly one place, and capability changes are visible in a six-line frontmatter diff. Enforcing the RAG and n8n boundaries in agent frontmatter requires the namespaced tool prefix `mcp__plugin_ai-engineering-system_<server>__<tool>`, not the bare server name, since that is how Claude Code exposes plugin-provided MCP tools under `--plugin-dir`.
