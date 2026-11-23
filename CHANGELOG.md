# Changelog

All notable changes to this plugin are documented here. Format: Keep a Changelog. Versioning: SemVer.

## [Unreleased]

### Fixed
- `block-destructive.sh` applies the destructive-SQL guard (DROP/TRUNCATE) only when the command
  invokes a SQL client (`psql`, `mysql`, `sqlite3`, ...), so a commit message or a test filter
  that merely mentions such a statement is no longer denied. Piped SQL and
  `docker exec ... psql -c` stay denied.
- RAG: Ollama calls now time out instead of hanging the MCP tool forever when the daemon is
  stuck: `/api/embed` after 60 s (`OllamaEmbeddings` constructor option), the `rag_status`
  `/api/tags` probe after 5 s (`collectStatus` `ollamaTimeoutMs`). Both report a readable
  "timed out after" error.
- RAG: `upsertSourceWithChunks` inserts chunks in batches of 100 rows (`CHUNK_INSERT_BATCH`)
  instead of one statement per chunk, so ingesting a large document takes a handful of
  round-trips rather than hundreds.

## [0.1.0] - 2026-09-22

### Added
- Plugin manifest (`.claude-plugin/plugin.json`) and local marketplace (`.claude-plugin/marketplace.json`).
- Six agents: architect, backend, tester, reviewer, research, automation.
- Workflow skills: implement-feature, review, research, setup-project.
- Rule skills shared by the agents.
- Contracts for architecture-plan, implementation-result, test-result, review-result and research-result.
- Hooks: block-destructive, block-secrets, restrict-tester-paths, restrict-tester-bash and
  session-banner, with a fixture-driven runner (`hooks/tests/run.sh`).
- Six plugin evals under `evals/`.
- CI for hook fixtures, shellcheck, plugin validation and scheduled evals.
- ADR-001 to ADR-005 and ADR-007.
- RAG: Postgres + pgvector + Ollama bge-m3 compose stack, migrations, chunker, incremental
  ingest CLI, doctor, read-only MCP server (`search_knowledge`, `list_sources`, `get_source`,
  `rag_status`), the `/ingest-knowledge` workflow skill, ADR-006, and a `rag` CI job.

### Fixed
- `block-destructive.sh` and `restrict-tester-bash.sh` now honour git global flags before the
  subcommand, so `git -C /repo push -f origin main`, `git --git-dir=... push -f`,
  `git -c k=v push --force`, `git --no-pager -C x reset --hard` and `git -C x stash` are denied.
- `block-destructive.sh` strips every quote from an `rm` target, so spliced forms
  (`rm -rf "$HOME"/`, `rm -rf "/"*`, `rm -rf ""/`) and `` rm -rf `pwd` `` are denied.
- Docs: ADR-007 lists `restrict-tester-bash.sh` among the hooks, the design spec's hooks table
  records MultiEdit on the `block-secrets.sh` matcher, and ADR-003 notes that the tester Bash
  guard is a deny-list, not a sandbox.
- Plugin-namespaced MCP tool prefixes in agents; RAG tool pre-approval in the setup-project
  template; ingest-knowledge allowed-tools.
