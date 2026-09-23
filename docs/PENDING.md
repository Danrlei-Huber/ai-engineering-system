# Pending items after v0.1.0

Status snapshot: `main` at v0.1.0 (2026-09-23). Plugin core and RAG merged; CI green on `hooks`, `plugin`, `rag`.
Source of each item: the SDD ledgers (`.superpowers/sdd/*/progress.md`, git-ignored) and the final whole-branch reviews.

## 1. Actions only the repository owner can take

- [ ] Set the CI secret and run the evals once: `gh secret set ANTHROPIC_API_KEY` then `gh workflow run ci --ref main`. The `evals` job installs `bubblewrap` and `socat`, so the two Bash-dependent cases (`destructive-command-blocked`, `review-flags-missing-tests`) run there for the first time. If the runner logs `bwrap: setting up uid map`, add `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` to the job.
- [ ] To run the full eval suite locally: `sudo apt-get install -y bubblewrap socat`.
- [ ] Move the n8n API key out of `~/.claude.json` into the shell environment (`export N8N_API_KEY=...`); the plugin's `.mcp.json` reads it from there.

## 2. Verifications to perform once

- [ ] First marketplace install: confirm plugin MCP tools are still exposed as `mcp__plugin_ai-engineering-system_<server>__<tool>` (agents depend on that prefix; verified so far only with `--plugin-dir`).
- [ ] Confirm Claude Code starts the plugin MCP server with the project directory as cwd, so `readProjectName` resolves the default project (the live end-to-end test cited a `_global` ADR; per-project scoping is not yet proven).
- [ ] Re-verify on every Claude Code upgrade that PreToolUse hook input still carries the top-level `agent_type` field; `restrict-tester-paths.sh` and `restrict-tester-bash.sh` fail open without it.

## 3. Guard hooks (hooks/scripts/) — parked findings

- [ ] `block-destructive.sh` inspects only the first non-flag `rm` argument (`rm -rf node_modules /` allowed).
- [ ] ANSI-C quoting (`rm -rf $'/'`) is not modelled.
- [ ] `git --exec-path=... stash`-style globals with values the regex list does not know slip past `restrict-tester-bash.sh`.
- [ ] `restrict-tester-bash.sh` is a deny-list, not a sandbox: `curl -o`, `wget -O`, interpreter one-liners, `install`, `ln`, `chmod` can still write files. Reviewer Bash write boundary is prompt-only (spec §10).
- [ ] Extra destructive patterns to consider: `git clean -fdx`, `git checkout -- .`, `find -delete`, `docker volume prune`.
- [ ] `Grep` on `.env` and Bash `cat .env` are outside `block-secrets.sh`; `NotebookEdit`, `github_pat_` tokens and 40-char AWS secret keys are not covered.
- [ ] `.envrc` is denied by the `.env*` basename rule (literal spec reading; decide whether to exempt).
- [ ] Tester gate is a `*:tester` suffix match across any plugin; tighten to `ai-engineering-system:tester|tester` when convenient.
- [ ] `session-banner.sh` `root=` fallback lacks `|| true` (unreachable while hooks.json sets `CLAUDE_PLUGIN_ROOT`).
- [ ] Whole-input invalid JSON makes jq exit non-zero (non-blocking error in Claude Code, not a silent allow).

## 4. RAG (rag/) — parked findings

- [ ] `pruneSources` uses `LIKE prefix||'%'` without escaping `_` and `%`; use `starts_with` or escape.
- [ ] Chunker: overlap paragraph can be emitted alone before a block larger than `maxChars`; mixed fence markers (``` inside ~~~) toggle `inFence`; a single fenced block larger than `maxChars` is emitted whole (intentional, documented).
- [ ] `SKIP_DIRS` contains `dist`, which would skip a legitimate `docs/dist/`; match only at the root.
- [ ] Filtered HNSW scans can return fewer than `limit` rows once many projects exist; consider `hnsw.iterative_scan` or a higher `ef_search`.
- [ ] Targets outside `--root` produce stored paths like `../x.md`; reject or document.
- [ ] `ensureTestDatabase()` check-then-create is not atomic; safe only while `fileParallelism: false`.
- [ ] `pendingMigrations` and `pendingMigrationsReadOnly` duplicate the diff logic.
- [ ] Config tests leave `mkdtemp` directories behind.
- [ ] Migration file sort is lexical (fine up to `999_`); `onnotice` is silenced.
- [ ] `cli/doctor.ts` calls `sql.end()` without a timeout.
- [ ] `describeError` routing could misclassify a Postgres error whose text contains "ollama" or "11434" (never observed).

## 5. Documentation and process

- [ ] CHANGELOG `### Fixed` under 0.1.0 describes corrections to unreleased code; fold into `### Added` or drop.
- [ ] README references to the RAG assume the build step (`cd rag && npm ci && npm run build`) was run; consider a `bin/` bootstrap script.
- [ ] Deferred from the spec (§9): source-code ingestion, hybrid search and reranking, aggregation of `.ai-engineering/runs/`, telemetry via `SubagentStop` hooks, `/bugfix`, `/refactor`, `/release` workflows, frontend/security/devops agents, Kubernetes and Terraform.
