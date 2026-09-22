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

- Subagent type: use the prefixed form `ai-engineering-system:<agent>` (e.g. `ai-engineering-system:reviewer`) with the Agent tool — confirmed working on claude 2.1.280; no fallback to the bare name was needed.
- Skill name: use the bare form (e.g. `rules-architecture`) in an agent's frontmatter `skills:` list — confirmed preloaded and reported by the dispatched subagent itself; no `ai-engineering-system:` prefix was needed.
