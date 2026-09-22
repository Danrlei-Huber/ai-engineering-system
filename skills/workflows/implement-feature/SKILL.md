---
name: implement-feature
description: Full engineering pipeline for a feature: research, architecture plan, human approval gate, implementation, tests, independent review with bounded rework, summary and run record.
disable-model-invocation: true
argument-hint: [feature description]
---

# /implement-feature

Feature: $ARGUMENTS

You are the orchestrator. You run the state machine below in the main session. You pass **only
contract objects** between agents (the ```yaml blocks), never their transcripts. Read
`${CLAUDE_PLUGIN_ROOT}/contracts/README.md` once before starting.

Record `started_at` (ISO-8601 UTC) now. Keep a `stages` list in your working notes; append an
entry `{name, agent, started_at, finished_at, outcome}` as each state finishes.

## State machine

| State        | Agent (subagent type)               | Input                                                        | Output              | Exit                                                                 |
|--------------|-------------------------------------|--------------------------------------------------------------|---------------------|----------------------------------------------------------------------|
| RESEARCH     | ai-engineering-system:research      | feature, cwd                                                  | research-result     | always → ARCHITECTURE                                                |
| ARCHITECTURE | ai-engineering-system:architect     | feature, research-result                                      | architecture-plan   | always → HUMAN GATE                                                  |
| HUMAN GATE   | none (you, with the user)           | architecture-plan                                             | decision            | approve → BACKEND; changes → ARCHITECTURE with the user's notes; abort → DONE |
| BACKEND      | ai-engineering-system:backend       | architecture-plan (+ review-result when reworking)            | implementation-result | always → TESTER                                                    |
| TESTER       | ai-engineering-system:tester        | architecture-plan, implementation-result                      | test-result         | always → REVIEWER                                                    |
| REVIEWER     | ai-engineering-system:reviewer      | feature, architecture-plan, test-result, diff scope           | review-result       | always → DECIDE                                                      |
| DECIDE       | none                                | review-result                                                 | —                   | APPROVE → DONE; CHANGES and rework_count < 2 → BACKEND (rework_count += 1); CHANGES and rework_count == 2 → DONE with status "needs-human" |
| DONE         | none                                | all contracts                                                 | summary, run record | —                                                                    |

## Rules per state

**RESEARCH.** Dispatch with the feature text and "end with the research-result contract". If the
block is missing, redispatch once asking only for the contract.

**ARCHITECTURE.** Dispatch with the feature text and the research-result block. If the returned
plan has non-empty `open_questions`, they go to the user at the gate.

**HUMAN GATE.** This is the only place that waits on the user. Show the plan: `summary`, the
`files` table, `tests`, `risks`, `adr` (and `adr_draft` if present), `open_questions`. Then ask
exactly: "Approve this plan, request changes, or abort?" Nothing may be edited before the user
approves. If the session is non-interactive and no answer can arrive, stop here: print the plan,
state that the workflow is awaiting approval, write the run record with `review_status:
"awaiting-approval"`, and end.

**BACKEND.** Dispatch with the approved plan (and, on rework, the review-result). Never pass the
research-result; the plan already contains what matters.

**TESTER.** Dispatch with the plan and the implementation-result. If `production_changes_needed`
is non-empty, treat it as a review finding of severity major for the DECIDE step.

**REVIEWER.** Dispatch with: the feature text, the plan, the test-result, and the diff scope
(`git diff` for uncommitted work). Do **not** pass the implementation-result or any explanation
from the backend agent.

**DECIDE.** Read `status`. On CHANGES with rework budget left, loop to BACKEND passing the
review-result. After two reworks, stop and hand everything to the user.

**DONE.** Print: what changed (`files_changed` from the last implementation-result), test numbers,
review status, rework count, and any ADR draft that must be filed. Then write the run record.

## Run record

Create `.ai-engineering/runs/` if needed and write `<started_at with ":" replaced by "-">.json`:

```json
{
  "workflow": "implement-feature",
  "plugin_version": "<from ${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json>",
  "description": "<feature text>",
  "started_at": "...",
  "finished_at": "...",
  "stages": [{ "name": "RESEARCH", "agent": "research", "started_at": "...", "finished_at": "...", "outcome": "ok" }],
  "review_status": "APPROVE | CHANGES | awaiting-approval | aborted | needs-human",
  "rework_count": 0,
  "files_changed": ["..."]
}
```

`files_changed` holds the `path` values from the last implementation-result.

Never commit on the user's behalf inside this workflow; leave the working tree for them to review.
