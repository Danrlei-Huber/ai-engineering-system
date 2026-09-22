# ai-engineering-system

This repository IS a Claude Code plugin. The root is the plugin root.

## Layout
- `agents/` role agents (flat .md). `skills/workflows/` orchestrators. `skills/rules/` preloaded rule sets.
- `contracts/` hand-off schemas between agents. `hooks/` deterministic guardrails. `rag/` knowledge base (TypeScript).
- `evals/` plugin evals. `docs/decisions/` ADRs. `docs/superpowers/` specs and plans.

## Commands
- Validate plugin: `claude plugin validate . --strict`
- Hook tests: `bash hooks/tests/run.sh`
- Lint hooks: `shellcheck hooks/scripts/*.sh hooks/tests/run.sh`
- RAG tests: `cd rag && npm test`
- Evals (costs tokens): `claude plugin eval . --scaffold --trust-plugin --ablation none --threshold 0.8 --allow-tools Bash Write Edit`
- Dev loop in another project: `claude --plugin-dir /path/to/ai-engineering-system`

## Rules
- Artifacts are written in English.
- Any architectural change needs an ADR in `docs/decisions/` before the code.
- Never commit secrets. `.mcp.json` reads keys from the environment.
- Hooks must stay bash + jq only and pass shellcheck.
- Agents that write code never review; agents that review never write. Only `automation` may hold n8n tools.
