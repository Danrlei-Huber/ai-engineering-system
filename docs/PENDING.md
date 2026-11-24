# Pending items

Status snapshot: `main` at `9470e6c` (2026-11-24). Since v0.1.0 the four modules (`rag/`, `hooks/`,
`agents/`+`skills/`+`contracts/`, `evals/`) went through a review each; everything those reviews
fixed is in `CHANGELOG.md` under Unreleased and is not repeated here. This file lists only what is
still open, grouped by who can act on it.

## 1. Actions only the repository owner can take

- [ ] Set the CI secret and run the evals once: `gh secret set ANTHROPIC_API_KEY` then
  `gh workflow run ci --ref main`. The job now fails fast with an explicit error while the secret is
  missing. It installs `bubblewrap` and `socat`, so the two Bash cases (`destructive-command-blocked`,
  `review-flags-missing-tests`) would run under a sandbox for the first time anywhere; if the runner
  logs `bwrap: setting up uid map`, add `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`.
- [ ] To run the full eval suite locally: `sudo apt-get install -y bubblewrap socat`.
- [ ] Remove (or rename) the MCP servers configured outside the plugin with the plugin's server
  names: `engineering-rag` in this repo's `.claude/settings.local.json` and `n8n-mcp` in
  `~/.claude.json`. A same-named local- or user-scope server is exposed as `mcp__<server>__*` and the
  plugin's copy does not load, so the agents' plugin-prefixed grants match nothing (verified
  2026-11-23: no RAG for research/architect inside this repo, no n8n for automation anywhere).
- [ ] Move the n8n API key into the shell environment (`export N8N_API_KEY=...`); `.mcp.json` reads it
  from there.
- [ ] Pull the embedding model on the local Ollama (`docker compose up ollama-pull` in `rag/`);
  `rag_status` reports `have: none`, so local ingestion is impossible until then.
- [ ] Re-index the plugin standards: `cd rag && npm run ingest:standards`. `ADR-007` and
  `skills/rules/testing/SKILL.md` changed after the 2026-09-23 ingestion, so the RAG still serves the
  old testing rule. Needs the model above.
- [ ] Cut a release: Unreleased holds every review fix of 2026-11-23; bump `plugin.json` and
  `marketplace.json`, move the section to `## [0.2.0]`, tag.

## 2. Verifications to perform once

- [ ] First marketplace install: confirm plugin MCP tools are still exposed as
  `mcp__plugin_ai-engineering-system_<server>__<tool>` (verified with `--plugin-dir` on 2.1.280 and
  2.1.331 only).
- [ ] Confirm Claude Code starts the plugin MCP server with the project directory as cwd, so
  `readProjectName` resolves the default project; per-project scoping is not yet proven end to end.
- [ ] On every Claude Code upgrade, re-verify that PreToolUse hook input carries the top-level
  `agent_type` field: `restrict-tester-paths.sh` and `restrict-tester-bash.sh` fail open without it.
  Verified on 2.1.280 and 2.1.330; on 2.1.331 only the MCP prefix and skill preloading were re-checked,
  not the tester deny.

## 3. Guard hooks (hooks/scripts/) — parked findings

- [ ] `block-destructive.sh` inspects only the first non-flag `rm` argument (`rm -rf node_modules /`
  is allowed).
- [ ] ANSI-C quoting (`rm -rf $'/'`) and other obfuscations (`$(which rm)`, `R=rm; $R`) are not
  modelled; ADR-007 treats bypassing a hook as a deliberate human act.
- [ ] A forced push with no refspec on a main checkout (`git push -f origin`) cannot be told apart
  statically and is allowed.
- [ ] `git --exec-path=... stash`-style globals the regex list does not know slip past
  `restrict-tester-bash.sh`.
- [ ] `restrict-tester-bash.sh` is a deny-list, not a sandbox: `curl -o`, `wget -O`, interpreter
  one-liners, `npx ... --write`, `touch`, `install`, `ln`, `chmod`, `git commit/add/push` still write.
  The reviewer's Bash write boundary is prompt-only (spec §10).
- [ ] `Grep` on `.env` and Bash `cat .env` are outside `block-secrets.sh`; `github_pat_` tokens and
  40-character AWS secret keys are not matched.
- [ ] The tester gate is a `*:tester` suffix match across any plugin; tighten to
  `ai-engineering-system:tester|tester` when convenient.
- [ ] `session-banner.sh` `root=` fallback lacks `|| true` (unreachable while hooks.json sets
  `CLAUDE_PLUGIN_ROOT`).

## 4. RAG (rag/) — parked findings

- [ ] `SKIP_DIRS` contains `dist`, which would skip a legitimate `docs/dist/`; match only at the root.
- [ ] `ensureTestDatabase()` check-then-create is not atomic; safe only while `fileParallelism: false`.
- [ ] `pendingMigrations` and `pendingMigrationsReadOnly` duplicate the diff logic.
- [ ] Config tests leave `mkdtemp` directories behind.
- [ ] Migration file sort is lexical (fine up to `999_`); `onnotice` is silenced.
- [ ] `cli/doctor.ts` calls `sql.end()` without a timeout.
- [ ] `describeError` routing could misclassify a Postgres error whose text contains "ollama" or
  "11434" (never observed).
- [ ] Dev-only `npm audit` advisories remain in the vitest/vite chain; `npm audit fix` within `^5.0.1`
  clears them.

## 5. Agents, skills, contracts

- [ ] The architect searches the RAG `decisions` collection for ADRs, but the plugin's own ADRs are
  ingested into `standards` (ADR-006); it should search both, or the contract rule should say so.
- [ ] Contracts are checked structurally in prose (required keys in `contracts/README.md`), not by a
  validator; evals grep for a few keys.
- [ ] `/setup-project` records the plugin version in `project.yaml` and the banner now warns on
  drift, but nothing migrates an old scaffold forward.

## 6. Evals

- [ ] `destructive-command-blocked` and `review-flags-missing-tests` have never passed anywhere (they
  need the CI sandbox and the secret).
- [ ] No case covers the reviewer's independence, the rework loop and DECIDE, `status: blocked`,
  `/setup-project`, `/ingest-knowledge` (needs `mocks/`), or the `automation` agent.

## 7. Deferred from the spec (§9)

Source-code ingestion, hybrid search and reranking, aggregation of `.ai-engineering/runs/`,
telemetry via `SubagentStop` hooks, `/bugfix`, `/refactor`, `/release` workflows, frontend/security/
devops agents, Kubernetes and Terraform. A `bin/` bootstrap script for the RAG build step.
