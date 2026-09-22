# architecture-plan

Produced by `architect`. Shown to the user at the human gate, then consumed by `backend`,
`tester` and `reviewer`.

```yaml
summary: >-           # what will change and why, 3-8 sentences
  ...
files:
  - path: src/...
    action: create | modify | delete
    purpose: ...
tests:                # what must be proven true; the tester turns these into test cases
  - ...
risks:
  - ...
adr: none | reuse ADR-00X | draft   # "draft" means a new ADR text follows in `adr_draft`
adr_draft: ""         # full ADR text when adr == draft, else empty
open_questions: []    # blocking questions for the user; the gate cannot pass with unanswered ones
```

Rules: search the RAG `decisions` collection before writing this. Reuse an ADR when one covers
the decision. Draft one when the change alters layering, storage, external integrations,
authentication or deployment.
