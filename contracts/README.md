# Contracts

A contract is the only thing one agent hands to the next. Orchestrating skills pass contract
objects, never transcripts. Every agent ends its reply with exactly one fenced ```yaml block
matching its contract. Text before the block is allowed; text after it is ignored.

| Producer   | Contract                | Consumers                     |
|------------|-------------------------|-------------------------------|
| research   | research-result.md      | architect, user               |
| architect  | architecture-plan.md    | user (human gate), backend, tester, reviewer |
| backend    | implementation-result.md| tester, reviewer              |
| tester     | test-result.md          | reviewer, user                |
| reviewer   | review-result.md        | orchestrator (decide), user   |

## Dispatch names

- Subagent type: use the prefixed form `ai-engineering-system:<agent>` (e.g. `ai-engineering-system:reviewer`) with the Agent tool — confirmed working on claude 2.1.280 and 2.1.330; no fallback to the bare name was needed.
- Skill name: use the bare form (e.g. `rules-architecture`) in an agent's frontmatter `skills:` list — confirmed preloaded and reported by the dispatched subagent itself; no `ai-engineering-system:` prefix was needed.
- MCP tools provided by this plugin are exposed as `mcp__plugin_ai-engineering-system_<server>__<tool>` (verified live on Claude Code 2.1.280 and 2.1.331 with `--plugin-dir`, dispatching the research agent from a directory outside this repository); agent frontmatter must use that prefix, and the server-level form `mcp__plugin_ai-engineering-system_<server>` in `tools:` grants every tool of that server. Still to re-verify after a marketplace install.
- An MCP server with the same name configured at local or user scope (for example a development `engineering-rag` in `.claude/settings.local.json`, or an `n8n-mcp` in `~/.claude.json`) is exposed as `mcp__<server>__<tool>` and the plugin's own copy does not load, so the agents' plugin-prefixed grants match nothing and they run without that server. Remove or rename such entries when running the plugin.

## Required keys

The orchestrators check these before accepting a block (missing or malformed → one redispatch, then stop):

| Contract              | Required top-level keys                                              |
|-----------------------|----------------------------------------------------------------------|
| research-result       | `answer`, `rag_available`, `evidence`, `sources`, `confidence`       |
| architecture-plan     | `summary`, `files`, `tests`, `risks`, `adr`, `open_questions`        |
| implementation-result | `status`, `files_changed`, `commands_run`, `deviations_from_plan`    |
| test-result           | `command`, `passed`, `failed`, `skipped`, `failures`                 |
| review-result         | `status`, `findings`, `tests`, `summary`                             |
