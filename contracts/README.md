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
