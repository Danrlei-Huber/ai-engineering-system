# ai-engineering-system

A Claude Code plugin that turns "AI writes code" into a versioned, testable engineering process:
role agents with least-privilege tools, orchestrating workflows with a human approval gate,
deterministic guardrails, and a read-only knowledge base.

## Install

Development (no install):
```bash
claude --plugin-dir /path/to/ai-engineering-system
```

Install by name from the local marketplace:
```bash
claude plugin marketplace add /path/to/ai-engineering-system
claude plugin install ai-engineering-system@ai-engineering-local
```

`.claude-plugin/marketplace.json` uses a relative-path `source: "."` — the only form the
validator accepts for a local marketplace. When the repo is pushed to GitHub, the source can be
switched to `{ "source": "github", "repo": "<owner>/ai-engineering-system" }` per the
[marketplace docs](https://docs.claude.com/en/docs/claude-code/plugin-marketplaces).

## Configure

Export in your shell (never commit these):
```bash
export N8N_API_KEY=...            # n8n MCP
export N8N_API_URL=http://localhost:5678
```
See `.env.example` for the RAG variables and `rag/README.md` for bringing the knowledge base up.

## Use in a project

1. `/setup-project` writes `CLAUDE.md`, `.claude/settings.json` (deny rules) and `.ai-engineering/project.yaml`.
2. `/implement-feature <description>` runs research → plan → **your approval** → implement → test → review.
3. `/review [base]` reviews the current diff independently.
4. `/research <question>` answers with cited sources.
5. `/ingest-knowledge [path]` indexes docs and ADRs into the RAG.

Skill names may collide with other installed skills or plugins. If a bare `/review` or
`/research` does not route to this plugin, use the prefixed form instead:
`/ai-engineering-system:review`, `/ai-engineering-system:research`,
`/ai-engineering-system:implement-feature`, `/ai-engineering-system:setup-project`.

Claude Code refuses to write `.claude/settings.json` in non-interactive (`-p`) mode, so run
`/setup-project` in an interactive session; alternatively, copy
`skills/workflows/setup-project/templates/settings.json` by hand.

## What is enforced, not suggested

- `rm -rf` on roots, force-push to main, `git reset --hard`, `DROP/TRUNCATE`, `kubectl delete`, `terraform destroy`, `docker system prune` are denied by hooks.
- Writing credential-like content or touching `.env*` (except `.env.example`) is denied.
- The tester agent can write only test paths. The reviewer and architect cannot edit. Only `automation` reaches n8n.
- The tester restriction is a plugin-level hook that applies only when the calling subagent is
  the tester; agent-frontmatter hooks are ignored for plugin agents in Claude Code 2.1.x.

## Develop this plugin

```bash
claude plugin validate . --strict
bash hooks/tests/run.sh
shellcheck hooks/scripts/*.sh hooks/tests/run.sh evals/*/scaffold.sh
claude plugin eval . --scaffold --trust-plugin --ablation none --threshold 0.8 --allow-tools Bash Write Edit   # costs tokens
```

Granting Bash in the eval sandbox requires `bubblewrap` and `socat`
(`sudo apt-get install -y bubblewrap socat`). Without them, Bash cannot be granted inside the eval
sandbox. Two cases require it and are skipped by environment (`destructive-command-blocked`,
`review-flags-missing-tests`); the other cases list Bash in `allowed_tools` but pass without it.
Hook fixtures currently number 75.

Decisions: `docs/decisions/`. Design: `docs/superpowers/specs/`.
