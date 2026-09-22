---
name: rules-testing
description: Testing rules for backend, tester and reviewer agents. Preloaded; not invoked directly.
user-invocable: false
---

# Testing rules

1. Every feature ships with tests that prove the behaviour listed in the architecture-plan `tests` field. No plan item may be left unproven.
2. A bugfix starts with a failing test that reproduces the bug, then the fix, then the test passes.
3. Tests live under the project's test paths: `tests/**`, `test/**`, `__tests__/**`, or files named `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.go`.
4. Use the project's existing test runner and conventions (read `.ai-engineering/project.yaml` `test_command`, else `package.json` scripts, `pyproject.toml`, `pom.xml`, `go.mod`).
5. Test names state behaviour, not implementation: `returns 404 when the user is missing`, not `test handler 2`.
6. Assert on outcomes, not on internal calls, unless the interaction itself is the contract.
7. Run the whole suite before reporting. Report real numbers. A test-result with `failed: 0` must come from an actual run.
