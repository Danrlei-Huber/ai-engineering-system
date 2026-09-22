# {{PROJECT}}

## Stack
{{STACK_LINES}}

## Rules
- Every feature ships with tests. Run: `{{TEST_COMMAND}}`
- Never commit secrets; read them from the environment.
- Destructive operations require explicit human confirmation.
- Architectural changes get an ADR in `docs/decisions/`.

## Workflow
Use the ai-engineering-system plugin: `/implement-feature`, `/review`, `/research`.
Project knowledge is indexed with `/ingest-knowledge`.
