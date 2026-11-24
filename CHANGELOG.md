# Changelog

All notable changes to this plugin are documented here. Format: Keep a Changelog. Versioning: SemVer.

## [Unreleased]

### Added
- Hooks: `block-destructive.sh` also denies deleting main/master on the remote
  (`git push --delete`, `-d`, the `:main` refspec) or locally (`git branch -D|-d|--delete
  main`), `git clean -f`, `docker compose down -v`/`--volumes` (also `docker-compose`),
  `docker volume prune|rm`, `find -delete` starting from the root or home, and the
  root/parent spellings `//`, `../..` and a backslash-escaped `rm`.
- RAG: `npm run migrate:down` reverts the last applied migration with its `NNN_name.down.sql`
  (`rollback()` in `migrate.ts`); `migrations/001_init.down.sql` added. `listMigrationFiles`
  ignores `.down.sql` files.
- RAG: ESLint (`npm run lint`, typescript-eslint type-checked over `src/` and `test/`), run by CI.
- Plugin icon (`.claude-plugin/icon.png`, 1024 px), required by `claude plugin validate --strict`
  from Claude Code 2.1.330.

### Changed
- Hooks: the four guard scripts fail closed when `jq` is missing (exit 2, the blocking
  PreToolUse code, with an install hint on stderr) instead of exiting 127, which Claude Code
  treats as a non-blocking error and lets the call through. `session-banner.sh` warns about it
  at session start. `hooks/tests/run.sh` asserts the fail-closed exit code for each guard.
- Hooks: `block-secrets.sh` lets the env templates `.env.sample`, `.env.template` and
  `.env.dist` and direnv's `.envrc` through, alongside `.env.example`; they hold no secrets.
- RAG: `get_source` rebuilds the document with headings at the depth of their path (`Doc > Setup`
  becomes an H2 `Setup`), emitted once per section; it used to print `## <full path>` before
  every chunk.
- RAG: `ingest` rejects path-based targets outside `--root`, since stored paths are
  root-relative; `parseIngestArgs` only validates argument shape and leaves filesystem checks
  to `ingest()`. The unused `IngestOptions.metadata` was removed.
- The repository's own development instructions moved from `CLAUDE.md` to `.claude/CLAUDE.md`.
  Claude Code loads both locations; the plugin validator warns about a root `CLAUDE.md`
  because it is not shipped as plugin context. `claude plugin validate --strict` passes on
  Claude Code 2.1.330.
- CI uses `actions/checkout@v7`, `actions/setup-node@v7` and `actions/upload-artifact@v7`
  (were v4), the current majors, which run on Node 24; GitHub had started forcing the v4 majors
  off the deprecated Node 20 runtime with a warning on every job.
- CI installs Claude Code 2.1.330 (was 2.1.280) for the `plugin` and `evals` jobs. The
  `agent_type` hook-input field and the `<plugin>:<agent>` subagent type were re-verified on
  2.1.330.

### Fixed
- `block-destructive.sh`: the argument scans of the git, docker and find matchers stop at
  the next shell separator (`;`, `&&`, `||`, `|`, newline), so `git push origin feature; make
  -f Makefile main` is no longer read as a forced push to main. A newline is turned into a
  `;` token before tokenising.
- `block-destructive.sh`: a newline now counts as a command separator in the read-only
  exemption, so an `echo` or `grep` followed on the next line by a recursive delete of the
  root or a hard reset is denied; the whitespace collapse had turned the newline into a
  space before the check.
- `block-destructive.sh`: tokens are normalised once into arrays instead of through a
  subshell per token per matcher, and a keyword fast path skips the loops for most
  commands. A 49 KB command took 5.7 s, over half the 10 s hook timeout after which a hook
  no longer blocks; it now takes about 20 ms. `hooks/tests/run.sh` fails any fixture over a
  3 s budget (`HOOK_BUDGET_MS`), with a 19 KB fixture to keep it honest.
- `restrict-tester-bash.sh`: in-place edits are found token by token after `sed` or
  `perl`, so `sed -E -i`, `sed -e '...' -i` and `perl -pi -e` are denied; `>&2` and `1>&2`
  no longer count as output redirection, so a message to stderr is allowed.
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
- RAG: the MCP server connects its stdio transport before probing the embedding contract
  (`start()` in `server.ts`). The probe can take tens of seconds while Ollama loads the model,
  and running it first left the MCP handshake waiting until the client gave up. A dimension
  mismatch still exits with code 1.
- RAG chunker: a fence now closes only on a line of the same marker (backticks or tildes) at
  least as long as the opening one, per CommonMark; a `~~~` line inside a backtick block, or a
  shorter run, no longer ends it. `extractTitle` skips `#` lines inside fences, so a shell
  comment in a code block preceding the H1 is no longer taken as the document title.
- RAG: `pruneSources` takes the path prefix literally; `_` and `%` in a directory name
  (`docs_v1/`) no longer act as LIKE wildcards, which could have pruned a sibling directory.
- RAG: the MCP server ends its connection pool and exits 0 when the client closes the stdio
  transport; it used to linger until killed. The server version is read from `package.json`
  instead of a duplicated constant, and a status check that throws a non-Error value reports
  it as text instead of "undefined".
- RAG: the CLIs and the MCP server read `rag/.env`, the same file docker compose reads, and
  derive the database and Ollama URLs from `RAG_DB_USER`, `RAG_DB_PASSWORD`, `RAG_DB_NAME`,
  `RAG_DB_PORT` and `OLLAMA_PORT`. Changing a port or password there used to break
  `npm run migrate`, `doctor`, `ingest` and the server silently, because they only looked at
  `RAG_DATABASE_URL`/`OLLAMA_URL` with hardcoded defaults. Precedence: shell environment, then
  `rag/.env`, then the compose defaults; empty values count as unset, so `.mcp.json` now passes
  `${VAR:-}` instead of duplicating the defaults. The integration-test database URL follows the
  same variables (always database `rag_test`).

### Security
- RAG: `@modelcontextprotocol/server` 2.0.0 -> 2.4.0 and `zod` -> 4.6.7, clearing the
  `npm audit --omit=dev` advisories (GHSA-jm63-cq47-j5jp, GHSA-46jr-4wx8-v453,
  GHSA-rvq5-wwqv-78pq, GHSA-f897-62hf-6gxq, GHSA-mrhx-c7xc-m3w5). The MCP ones concern HTTP
  transports; this server speaks stdio only.

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
