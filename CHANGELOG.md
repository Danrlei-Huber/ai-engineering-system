# Changelog

All notable changes to this plugin are documented here. Format: Keep a Changelog. Versioning: SemVer.

## [Unreleased]

### Added
- Plugin manifest (`.claude-plugin/plugin.json`) and local marketplace (`.claude-plugin/marketplace.json`).
- Six agents: architect, backend, tester, reviewer, research, automation.
- Workflow skills: implement-feature, review, research, setup-project.
- Rule skills shared by the agents.
- Contracts for architecture-plan, implementation-result, test-result, review-result and research-result.
- Hooks: block-destructive, block-secrets, restrict-tester-paths, restrict-tester-bash and
  session-banner, with a fixture-driven runner (`hooks/tests/run.sh`).
- Six plugin evals under `evals/`.
- CI for hook fixtures, shellcheck, plugin validation and scheduled evals.
- ADR-001 to ADR-005 and ADR-007.
