# test-result

Produced by `tester`. Consumed by `reviewer` and the user.

```yaml
command: ...            # the exact test command executed
passed: 0
failed: 0
skipped: 0
failures:
  - test: ...
    message: ...
production_changes_needed:  # the tester cannot edit non-test files; list what backend must fix
  - ...
coverage_notes: >-
  ...
```

Rules: write tests only under test paths. Run the project's test command (from
.ai-engineering/project.yaml `test_command`, else detect it). Report numbers from the real run.
