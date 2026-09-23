# AI Engineering System — v0.1 Design

**Date:** 2026-09-22
**Status:** Approved for planning
**Repository:** `ai-engineering-system/` (this repo is the plugin)

## 1. Purpose

Turn "AI writes code" into "AI participates in a versioned, testable, reproducible engineering process". This repository is a **Claude Code plugin** that bundles specialised subagents, orchestrating workflow skills, deterministic guardrails (hooks), a read-only knowledge base (RAG) and the tests that validate the system itself. Everything that defines agent behaviour lives in Git and is versioned independently of the projects that consume it.

Target consumers are the author's own projects (farmvision, fishvision, otqshield, …). The plugin is global; each project only carries a short `CLAUDE.md`, a `.claude/settings.json` and a small `.ai-engineering/` folder.

## 2. Decisions already taken

| Topic | Decision |
|---|---|
| Distribution | Claude Code plugin (`.claude-plugin/plugin.json`), installed via `--plugin-dir` for development and a local marketplace for installation |
| v0.1 scope | Plugin core + n8n MCP wiring + RAG (Postgres/pgvector + Ollama) |
| Workflow expression | **Option A**: skills orchestrate subagents in prose; the state machine is documented inside the skill; no separate workflow file or runtime |
| RAG stack | TypeScript (MCP TS SDK v2), embeddings via Ollama `bge-m3`, storage in PostgreSQL 17 + pgvector, all run from Docker Compose |
| Artifact language | English for all plugin artifacts (agents, skills, hooks, contracts, ADRs, README). Conversation with the author stays in Portuguese |
| Rules | Plugins cannot ship `rules/`; rule sets are skills with `user-invocable: false` preloaded by agents |
| Permissions | Plugins cannot ship `permissions.deny`; deterministic guardrails are `PreToolUse` hooks, and `setup-project` scaffolds deny rules into each target project |

## 3. Repository layout

```text
ai-engineering-system/
├── .claude-plugin/
│   ├── plugin.json              # name, version, description, author, skills paths
│   └── marketplace.json         # local marketplace entry pointing at this repo
├── agents/                      # flat .md files (directories are not discovered)
│   ├── architect.md
│   ├── backend.md
│   ├── tester.md
│   ├── reviewer.md
│   ├── research.md
│   └── automation.md
├── skills/
│   ├── workflows/               # user-facing orchestrators
│   │   ├── implement-feature/SKILL.md
│   │   ├── review/SKILL.md
│   │   ├── research/SKILL.md
│   │   ├── setup-project/SKILL.md
│   │   └── ingest-knowledge/SKILL.md
│   └── rules/                   # user-invocable: false, preloaded by agents
│       ├── architecture/SKILL.md
│       ├── testing/SKILL.md
│       └── security/SKILL.md
├── contracts/                   # hand-off schemas between agents
│   ├── research-result.md
│   ├── architecture-plan.md
│   ├── implementation-result.md
│   ├── test-result.md
│   └── review-result.md
├── hooks/
│   ├── hooks.json
│   ├── scripts/
│   │   ├── block-destructive.sh
│   │   ├── block-secrets.sh
│   │   ├── restrict-tester-bash.sh
│   │   ├── restrict-tester-paths.sh
│   │   └── session-banner.sh
│   └── tests/                   # bash runner + JSON fixtures
├── rag/                         # TypeScript workspace (Node >= 22, ESM)
│   ├── package.json
│   ├── tsconfig.json
│   ├── docker-compose.yml
│   ├── migrations/001_init.sql
│   ├── src/
│   │   ├── server.ts            # MCP stdio server
│   │   ├── ingest.ts            # CLI
│   │   ├── doctor.ts            # CLI
│   │   ├── migrate.ts           # CLI
│   │   ├── chunker.ts
│   │   ├── embeddings.ts        # Ollama client + fake provider
│   │   ├── db.ts
│   │   └── contract.ts          # embedding contract constants
│   └── test/
├── evals/                       # claude plugin eval cases
├── docs/
│   ├── decisions/               # ADR-001 … ADR-007
│   └── superpowers/specs/       # this document
├── .claude/settings.json        # dogfooding: same deny rules setup-project generates
├── .mcp.json                    # n8n-mcp + engineering-rag
├── .github/workflows/ci.yml
├── CLAUDE.md                    # short: how to develop THIS repo
├── README.md
├── CHANGELOG.md
├── .env.example
└── .gitignore
```

`skills/workflows` and `skills/rules` are declared in `plugin.json` under `skills`. If nested discovery proves unsupported during implementation, fall back to a flat `skills/` with `rules-*` prefixes; nothing else changes.

## 4. Plugin core

### 4.1 Principle

**Agents are roles that execute a function. Skills are how a task is orchestrated.** Agents are reusable components; workflows compose them. Future workflows (`/bugfix`, `/refactor`, `/release`) reuse the same agents.

### 4.2 Agents and capability boundaries

Least privilege: each agent gets the minimum tool set for its role. Nobody who writes code reviews it; nobody who reviews writes code. Only `automation` can reach n8n. Only `research` and `architect` can reach the RAG. All use `model: inherit`.

| Agent | Tools | Denied | Preloaded rules | Output contract |
|---|---|---|---|---|
| architect | Read, Glob, Grep, `mcp__engineering-rag__*` | Edit, Write, Bash, n8n | architecture | architecture-plan |
| backend | Read, Edit, Write, Glob, Grep, Bash | n8n, RAG | architecture, testing | implementation-result |
| tester | Read, Edit, Write, Glob, Grep, Bash (writes limited by private hook to `tests/**`, `**/*.test.*`, `**/*.spec.*`) | n8n, RAG | testing | test-result |
| reviewer | Read, Glob, Grep, Bash | Edit, Write, n8n, RAG | architecture, testing, security | review-result |
| research | Read, Glob, Grep, WebSearch, WebFetch, `mcp__engineering-rag__*` | Edit, Write, Bash, n8n | none | research-result |
| automation | Read, Glob, Grep, `mcp__n8n-mcp__*` | Edit, Write, Bash, RAG | security | free-form summary |

Denials use `disallowedTools` (e.g. `mcp__n8n-mcp`). The tester's path restriction is a `PreToolUse` hook declared in the agent's own frontmatter, so it applies only to that agent.

> Table names above (`mcp__engineering-rag__*`, `mcp__n8n-mcp__*`) are the logical server/tool names. In agent frontmatter, the concrete tool identity Claude Code grants under `--plugin-dir` is namespaced as `mcp__plugin_ai-engineering-system_<server>__<tool>` (e.g. `mcp__plugin_ai-engineering-system_engineering-rag__rag_status`); the bare form is not sufficient.

The reviewer receives **diff + requirements + architecture-plan + test-result**, never the implementer's narrative, to keep the review independent.

The architect must search the RAG `decisions` collection before planning; when the change is architectural and no ADR covers it, the plan includes a draft ADR.

### 4.3 Contracts

Each file in `contracts/` defines the shape an agent must return and the orchestrator must pass on. Orchestrators pass only contract objects between agents, never transcripts.

- **research-result**: `answer`, `evidence[]` (claim, source_id, quote), `sources[]` (source_id, path or url, relevance), `confidence` (high | medium | low), `rag_available` (bool).
- **architecture-plan**: `summary`, `files[]` (path, action, purpose), `tests[]` (what must be proven), `risks[]`, `adr` (none | reuse ADR-xxx | draft), `open_questions[]`.
- **implementation-result**: `files_changed[]`, `commands_run[]`, `deviations_from_plan[]`, `notes`.
- **test-result**: `command`, `passed`, `failed`, `skipped`, `failures[]` (test, message), `coverage_notes`.
- **review-result**: `status` (APPROVE | CHANGES), `findings[]` (severity critical | major | minor, file, issue, recommendation), `tests` (passed, failed), `summary`.

### 4.4 Workflow skills

All three orchestrators have `disable-model-invocation: true`; only the user triggers them.

**`/implement-feature <description>`** runs in the main session and drives this state machine:

| State | Agent | Input | Output | Exit condition |
|---|---|---|---|---|
| RESEARCH | research | description, cwd | research-result | always |
| ARCHITECTURE | architect | description, research-result | architecture-plan | always |
| HUMAN GATE | — | architecture-plan shown to user | approval / changes / abort | user answers; nothing is edited before this point |
| BACKEND | backend | architecture-plan (+ review-result on rework) | implementation-result | always |
| TESTER | tester | architecture-plan, implementation-result | test-result | always |
| REVIEWER | reviewer | diff, description, architecture-plan, test-result | review-result | always |
| DECIDE | — | review-result | — | APPROVE → DONE; CHANGES → BACKEND (max 2 reworks) → after that, hand state to user |
| DONE | — | all contracts | summary + run record | — |

On completion the skill writes `.ai-engineering/runs/<timestamp>.json` in the target project: workflow, stages with agent and duration, review status, rework count, files changed. No aggregation in v0.1.

**`/review [base]`** runs the reviewer on the current diff (or against `base`) and prints the review-result.

**`/research <question>`** runs the research agent and prints the research-result, with sources cited. Cycle required of the agent: `search_knowledge` → `get_source` when a chunk is ambiguous → cite.

**`/setup-project`** scaffolds a target project without overwriting existing files (proposes a merge instead):
- `CLAUDE.md` template with Stack, Rules and Workflow sections.
- `.claude/settings.json` with `permissions.deny` for `Read(./.env)`, `Read(./.env.*)`, `Bash(rm -rf *)`, `Bash(git push --force*)`, `Bash(git reset --hard*)`.
- `.ai-engineering/project.yaml`: `project`, `stack[]`, `test_command`, `ai_engineering_system.version`.

**`/ingest-knowledge [path]`** resolves `project` from `.ai-engineering/project.yaml`, defaults `docs/decisions/` → `decisions` and `docs/` → `docs`, and invokes the RAG CLI. No ingestion logic lives in the skill.

### 4.5 Rules (non-invocable skills)

- **architecture**: respect existing layering; put decisions in ADRs; migrations reversible; no production access from agents; only `automation` talks to external automation systems.
- **testing**: every feature ships with tests; bugfix starts with a failing test; naming conventions; tests live under the project's test paths.
- **security**: never commit secrets; never touch production; destructive operations require explicit human confirmation; only `automation` may call n8n.

### 4.6 Hooks (`hooks/hooks.json`)

Bash scripts with `jq` as the only dependency. Denials return `hookSpecificOutput.permissionDecision: "deny"` with a reason.

| Script | Event / matcher | Denies |
|---|---|---|
| block-destructive.sh | PreToolUse / Bash | `rm -rf` on `/`, `~`, `.`; `git push --force` to main/master; `git reset --hard`; `DROP TABLE|DATABASE`; `TRUNCATE`; `kubectl delete`; `terraform destroy`; `docker system prune` |
| block-secrets.sh | PreToolUse / Edit, Write, MultiEdit, Read | content matching AWS keys, `-----BEGIN PRIVATE KEY`, GitHub tokens, `sk-ant-`, JWTs; any write to `.env*` except `.env.example`; any read of `.env*` except `.env.example` |
| restrict-tester-paths.sh | PreToolUse / Edit, Write, MultiEdit (plugin-level, applies only when `agent_type` is the tester) | writes outside `tests/**`, `**/*.test.*`, `**/*.spec.*`; any dot-directory other than `.ai-engineering/runs/**` |
| restrict-tester-bash.sh | PreToolUse / Bash (plugin-level, applies only when `agent_type` is the tester) | file-writing shapes through the shell: output redirection, `tee`, `sed -i`, `mv`, `cp`, `patch`, `rm`, `truncate`, `dd`, `git checkout/restore/apply/stash` |
| session-banner.sh | SessionStart | nothing; prints plugin version, warns if `rag/dist` is missing or the project lacks `.claude/settings.json` deny rules (suggests `/setup-project`) |

### 4.7 MCP wiring (`.mcp.json`)

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "type": "stdio", "command": "npx", "args": ["-y", "n8n-mcp"],
      "env": { "MCP_MODE": "stdio", "LOG_LEVEL": "error", "DISABLE_CONSOLE_OUTPUT": "true",
               "N8N_API_URL": "${N8N_API_URL:-http://localhost:5678}", "N8N_API_KEY": "${N8N_API_KEY}" }
    },
    "engineering-rag": {
      "type": "stdio", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/rag/dist/server.js"],
      "env": { "RAG_DATABASE_URL": "${RAG_DATABASE_URL:-postgres://rag:rag_local_only@localhost:5433/rag}",
               "OLLAMA_URL": "${OLLAMA_URL:-http://localhost:11434}" }
    }
  }
}
```

The n8n API key moves from `~/.claude.json` into a shell environment variable. It never enters this repository.

## 5. RAG

### 5.1 Principles

One global database, partitioned by `project` (scope) and `collection`. Agents only read. Ingestion is an explicit human or workflow action through the CLI. The RAG is a **degradable dependency**: if Postgres or Ollama are down, the MCP server still starts and each tool returns an actionable error.

### 5.2 Embedding contract

```text
model      = bge-m3 (Ollama)
dimensions = 1024
distance   = cosine
```

Fixed for v0.1 and centralised in `rag/src/contract.ts`. `RAG_EMBED_MODEL` may override the model, but the server embeds a probe string at startup and fails fast if the dimension differs from 1024. A `fake` provider (`RAG_EMBED_PROVIDER=fake`) returns deterministic vectors for tests and CI.

### 5.3 Infrastructure (`rag/docker-compose.yml`)

| Service | Image | Notes |
|---|---|---|
| postgres | `pgvector/pgvector:pg17` | host port 5433, named volume, healthcheck, `restart: unless-stopped`, credentials from `.env` with dev-only defaults |
| ollama | `ollama/ollama` | port 11434, volume `/root/.ollama`, healthcheck, `restart: unless-stopped` |
| ollama-pull | `ollama/ollama` | one-shot `ollama pull bge-m3` with `OLLAMA_HOST=http://ollama:11434`, depends on ollama healthy. Community pattern, not official |

`.env.example` labels all defaults as **development credentials only**.

### 5.4 Schema (`rag/migrations/001_init.sql`, applied by `npm run migrate` with a `schema_migrations` table)

- `sources`: `id uuid`, `collection text` check in (`docs`, `decisions`, `standards`, `external`), `project text not null` (`_global` for plugin content), `path text`, `url text`, `title text`, `sha256 text`, `metadata jsonb`, `ingested_at timestamptz`. Unique on (`project`, `collection`, `coalesce(path, url)`).
- `chunks`: `id bigserial`, `source_id` FK cascade, `position int`, `heading_path text`, `content text`, `content_hash text` (sha256 of heading_path + content), `embedding vector(1024)`. HNSW index `vector_cosine_ops`; btree on (`project`, `collection`) via join or denormalised columns as the implementation finds simplest.

Extra metadata (language, version, confidence, topic, retrieved_at) lives in `metadata jsonb` and only becomes a column when a query needs to filter on it.

### 5.5 Chunker

Splits Markdown on ATX headings, keeps fenced code blocks intact, records the heading path (`Doc > Section > Subsection`) and prepends it to the chunk text before embedding. Sections over ~1800 characters split by paragraph with one paragraph of overlap. Custom, ~60 lines, no LangChain dependency.

### 5.6 Ingest CLI

`npm run ingest -- --collection <c> --project <p> [--url <u> --title <t>] [--prune] <file|dir>`

Markdown only in v0.1. Computes sha256, skips unchanged sources, replaces chunks of changed ones, deletes sources whose files vanished **only** with `--prune`. Embeds in batches of 16 via Ollama `POST /api/embed`.

### 5.7 MCP server (`rag/src/server.ts`, stdio, MCP TS SDK v2)

Reads `.ai-engineering/project.yaml` from `process.cwd()` at startup to learn the default project. All tools are read-only.

| Tool | Behaviour |
|---|---|
| `search_knowledge(query, project?, collections?, limit=8)` | cosine top-k; default scope is current project + `_global`; returns content, heading_path, path/url, title, collection, project, source_id, content_hash, score |
| `list_sources(project?, collection?)` | inventory |
| `get_source(source_id)` | full document rebuilt from chunks in order |
| `rag_status()` | Postgres reachable, pgvector present, Ollama reachable, model present, dimension check, migrations current, chunk count |

### 5.8 Doctor

`npm run doctor` prints a human checklist: Node version, Postgres, pgvector, Ollama, model, dimension, migrations, chunk count, `dist/` build present.

### 5.9 Testing

Vitest unit tests for chunker, embeddings client (mocked fetch), query builders. Integration test against a real pgvector Postgres with the `fake` embedding provider, so CI needs no Ollama.

## 6. Validation of the system itself

### 6.1 Plugin evals (`claude plugin eval .`)

Cases in `evals/<case>/prompt.md` + `graders/*.md`, grouped by `tags`. The eval sandbox is non-interactive, which is exactly what lets us prove the human gate.

| Case | Tag | Proves |
|---|---|---|
| implement-feature-stops-at-gate | workflow | research and architect run, a valid architecture-plan is produced, nothing is edited, run ends awaiting approval |
| review-flags-missing-tests | workflow | scaffolded repo with a diff lacking tests; `/review` returns `status: CHANGES` naming the missing tests |
| research-degrades-without-rag | workflow | with RAG down, research reports it and still returns a valid research-result from the codebase |
| destructive-command-blocked | security | explicit `git reset --hard` request; sentinel file survives; hook denial visible |
| secret-write-blocked | security | request to write an AWS key into a config file; file does not contain the key |
| tester-cannot-edit-src | security | tester dispatched to change `src/`; edit denied by the agent's private hook |

### 6.2 Hook tests

`hooks/tests/run.sh`: feeds JSON fixtures to each script on stdin and asserts allow/deny output. Bash + jq only.

### 6.3 CI (`.github/workflows/ci.yml`)

| Job | Trigger | Steps |
|---|---|---|
| hooks | every PR | shellcheck, `hooks/tests/run.sh` |
| rag | every PR | `npm ci`, typecheck, unit tests, integration tests with `pgvector/pgvector:pg17` service container and `RAG_EMBED_PROVIDER=fake` |
| plugin | every PR | validate manifest and agent/skill frontmatter (official command if one exists, else a small script) |
| evals | `workflow_dispatch` + weekly | `claude plugin eval . --json results.json --threshold 0.8 --no-publish`, needs `ANTHROPIC_API_KEY` repo secret |

## 7. Governance

### 7.1 ADRs (`docs/decisions/`, short form: context, decision, consequences)

1. ADR-001 Distribute the engineering system as a Claude Code plugin
2. ADR-002 Workflows are orchestrator skills; agents are roles
3. ADR-003 Least-privilege tool boundaries; only `automation` reaches n8n; reviewer and architect never edit
4. ADR-004 Rules are non-invocable skills preloaded by agents
5. ADR-005 Contracts define hand-offs between agents
6. ADR-006 RAG is global, read-only for agents, with a fixed embedding contract (bge-m3 / 1024 / cosine)
7. ADR-007 Deterministic guardrails live in hooks; `permissions.deny` is scaffolded into each project

These ADRs are the first content ingested into `standards` under `_global`.

### 7.2 Versioning and branching

Semver in `plugin.json`, `CHANGELOG.md`, git tags from `v0.1.0`. Branches `main` and `feature/*`, PRs via `gh`. Target projects record the plugin version they use in `.ai-engineering/project.yaml`. Plugin and projects evolve independently.

### 7.3 This repository's own CLAUDE.md

Short: what the repo is, how to run each suite, dev loop with `claude --plugin-dir .`, artifacts in English, architectural changes require an ADR. The repo carries `.claude/settings.json` with the same deny rules `setup-project` generates.

## 8. Security model (layers)

```text
Claude wants to do X
  → does the agent have the tool?        (agent frontmatter: tools / disallowedTools)
  → does the permission allow it?         (project .claude/settings.json)
  → does the hook allow it?               (PreToolUse, deterministic)
  → execute
```

Prompts are guidance; hooks and tool boundaries are enforcement.

## 9. Out of scope for v0.1 (recorded, not forgotten)

Source-code ingestion; hybrid search and reranking; aggregation of `.ai-engineering/runs/`; telemetry via `SubagentStop` hooks; `/bugfix`, `/refactor`, `/release` workflows; frontend, security and devops agents; Kubernetes and Terraform.

## 10. Items to confirm during implementation

- Nested skill directories via `plugin.json` `skills` paths (fallback: flat with prefixes).
- Existence of an official plugin validation command for the `plugin` CI job.
- Whether `tools:` in agent frontmatter accepts permission-style patterns; if not, rely on `disallowedTools` plus hooks (already the design).
- Ollama model auto-pull recipe in Compose (community pattern).
- Reviewer Bash write boundary is prompt-only (follow-up).

## 11. Verified facts and sources (2026-09-22)

- Plugin layout, manifest fields, auto-discovered directories, no `rules/` in plugins, `settings.json` limited to `agent` and `subagentStatusLine`: https://code.claude.com/docs/en/plugins-reference.md
- Subagent frontmatter (`tools`, `disallowedTools`, `skills`, `hooks`, `model`, `memory`, …): https://code.claude.com/docs/en/sub-agents.md
- Skill frontmatter (`disable-model-invocation`, `user-invocable`, `context: fork`, `agent`): https://code.claude.com/docs/en/skills.md
- Hook events, `hooks.json` schema, deny via `permissionDecision`, `${CLAUDE_PLUGIN_ROOT}`: https://code.claude.com/docs/en/hooks.md
- `.mcp.json` in plugins, `${VAR}` / `${VAR:-default}` expansion, stdio and http: https://code.claude.com/docs/en/mcp.md
- `claude plugin eval` case format, graders, sandbox, JSON report, CI flags: https://code.claude.com/docs/en/plugin-evals.md
- `--plugin-dir`, `marketplace.json`: https://code.claude.com/docs/en/plugins.md
- pgvector image tags and HNSW syntax: https://github.com/pgvector/pgvector
- Ollama image, `/api/embed`: https://docs.ollama.com/docker , https://github.com/ollama/ollama/blob/main/docs/api.md
- `bge-m3` 1024 dims, no prefixes required: https://ollama.com/library/bge-m3 , https://huggingface.co/BAAI/bge-m3
- MCP TS SDK v2 (`@modelcontextprotocol/server` 2.0.0, Node ≥ 20, zod v4): https://github.com/modelcontextprotocol/typescript-sdk
- `pgvector` npm 0.3.0 requires Node ≥ 22: https://github.com/pgvector/pgvector-node
