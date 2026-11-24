---
name: rules-testing
description: Testing rules for backend, tester and reviewer agents. Preloaded; not invoked directly.
user-invocable: false
---

# Testing rules

1. Every feature ships with tests that prove the behaviour listed in the architecture-plan `tests` field. No plan item may be left unproven.
2. A bugfix ships with a test that reproduces the bug and fails without the fix. Working alone, write that test first and watch it fail. Inside `/implement-feature` the roles split it: the architecture-plan lists the reproduction under `tests`, the backend implements the fix, the tester writes the test afterwards, and the reviewer checks that the test exercises the reported bug rather than the fix's implementation.
3. Tests live under the project's test paths. These are the paths the tester's hook accepts, so this list is the single source of truth: the directories `tests/`, `test/`, `__tests__/`, `spec/`, `e2e/` and `cypress/` at any depth; the file names `*.test.*`, `*.spec.*` (not `.spec.yaml|yml|json|md` data files), `test_*.py`, `*_test.py`, `conftest.py`, `*_test.go`, `*_spec.rb` and `*.cy.*`; and the plugin's own run records under `.ai-engineering/runs/`. No other dot-directory.
4. Use the project's existing test runner and conventions (read `.ai-engineering/project.yaml` `test_command`, else `package.json` scripts, `pyproject.toml`, `pom.xml`, `go.mod`).
5. Test names state behaviour, not implementation: `returns 404 when the user is missing`, not `test handler 2`.
6. Assert on outcomes, not on internal calls, unless the interaction itself is the contract.
7. Run the whole suite before reporting. Report real numbers. A test-result with `failed: 0` must come from an actual run.
