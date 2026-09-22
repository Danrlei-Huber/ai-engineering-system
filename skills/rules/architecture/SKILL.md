---
name: rules-architecture
description: Architecture rules every implementing or planning agent must follow. Preloaded by architect, backend and reviewer; not invoked directly.
user-invocable: false
---

# Architecture rules

1. Respect the project's existing layering and module boundaries. Put new code where its neighbours live; do not introduce a new layer without an ADR.
2. Decisions that alter layering, storage, external integrations, authentication or deployment require an ADR in `docs/decisions/` (format: context, decision, consequences). Check existing ADRs before proposing one.
3. Database migrations must be reversible. Every `up` has a `down`. Never drop or truncate in a migration without an explicit ADR.
4. Agents never touch production systems, databases or credentials. Everything runs against local or staging resources.
5. Only the `automation` agent may interact with external automation systems (n8n). Other agents describe the automation they need and stop.
6. Prefer small, focused files with one responsibility. Split a file that grows past what a reader can hold at once.
7. Public interfaces (functions, endpoints, schemas) change only with a stated reason and a plan for callers.
