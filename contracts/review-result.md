# review-result

Produced by `reviewer`. Consumed by the orchestrator (decide step) and the user.

```yaml
status: APPROVE | CHANGES
findings:
  - severity: critical | major | minor
    file: ...
    issue: ...
    recommendation: ...
tests:
  passed: 0
  failed: 0
summary: >-
  ...
```

Rules: `status: CHANGES` whenever there is a critical or major finding, whenever tests fail, or
whenever a planned test is missing. Judge the diff against the architecture-plan and the
test-result, not against the implementer's explanation.
