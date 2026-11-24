# Pending items

Status snapshot: `main` at `f4aacde`, two commits after v0.2.0 (2026-11-24). Between v0.1.0 and
v0.2.0 the five modules (`rag/`, `hooks/`, `agents/`+`skills/`+`contracts/`, `evals/`, `docs/`) went
through a review each; everything those reviews fixed is in `CHANGELOG.md` under 0.2.0 and is not
repeated here. GitHub Releases exist for v0.1.0 and v0.2.0 (v0.2.0 marked latest), each carrying its
CHANGELOG section. The plugin is loaded in development only, through `--plugin-dir`; the marketplace
install made for the verification below was removed again by choice. This file lists only what is
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
- [ ] Decide when to install the plugin for real use (`claude plugin marketplace add <repo>` then
  `claude plugin install ai-engineering-system@ai-engineering-local`). While it is installed, dev
  sessions opened in this repo with `--plugin-dir` load both copies. `claude plugin uninstall` leaves a
  full copy (with `rag/node_modules`, ~130 MB) under `~/.claude/plugins/cache/<marketplace>/` that has
  to be deleted by hand.
- [ ] Pull the embedding model on the local Ollama (`docker compose up ollama-pull` in `rag/`);
  `rag_status` reports `have: none`, so local ingestion is impossible until then.
- [ ] Re-index the plugin standards: `cd rag && npm run ingest:standards`. `ADR-007` and
  `skills/rules/testing/SKILL.md` changed after the 2026-09-23 ingestion, so the RAG still serves the
  old testing rule. Needs the model above.

## 2. Verifications to perform once

- [x] First marketplace install (2026-11-24, v0.2.0, Claude Code 2.1.331): plugin MCP tools are exposed
  as `mcp__plugin_ai-engineering-system_<server>__<tool>` exactly as with `--plugin-dir`; the research
  subagent received the four RAG tools and called `rag_status`; the session banner fired. The install
  reads the plugin straight from the repo path, so `rag/dist` was present without a separate build.
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
