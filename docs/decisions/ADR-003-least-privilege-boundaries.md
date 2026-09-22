# ADR-003: Least-privilege tool boundaries between agents

Status: Accepted (2026-09-22)

## Context
An agent with every tool can implement, review its own work and trigger external automations in one breath. That removes independence from the review and makes side effects hard to trace.

## Decision
Each agent gets the minimum tool set for its role. Agents that write code (backend, tester) never review; the reviewer and the architect never edit. Only `automation` holds n8n tools. Only `research` and `architect` hold RAG tools. The tester may write only test paths, enforced by a private hook.

## Consequences
Some tasks need two agents where one would do. In exchange, the reviewer's verdict is independent, external side effects come from exactly one place, and capability changes are visible in a six-line frontmatter diff.
