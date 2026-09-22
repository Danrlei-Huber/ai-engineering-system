---
name: review
description: Independent review of the current diff (or of changes since a base ref) by the reviewer agent, returned as a review-result contract with APPROVE or CHANGES.
disable-model-invocation: true
argument-hint: [base-ref]
---

# /review

Base ref: $ARGUMENTS (empty means review uncommitted changes with `git diff`).

Current status:
!`git status --short`

1. If a base ref was given, the diff scope is `git diff $ARGUMENTS...HEAD`; otherwise it is `git diff` plus untracked files.
2. Look for an architecture-plan for this change: the most recent `.ai-engineering/runs/*.json` whose `files_changed` overlaps the diff, or a plan the user pasted. If none exists, tell the reviewer "no plan available; review against the project's conventions and the visible intent of the change".
3. Look for a test-result the same way. If none, tell the reviewer to run the project's test command itself.
4. Dispatch the `ai-engineering-system:reviewer` subagent with: the diff scope, the plan (or the no-plan note), the test-result (or the run-it-yourself note), and the instruction to end with the review-result contract. Do not pass any implementer explanation.
5. Present the `status`, then findings grouped by severity, then `summary`. Print the raw contract block at the end.
