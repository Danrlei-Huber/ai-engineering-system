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

### Fixed
- `block-destructive.sh` and `restrict-tester-bash.sh` now honour git global flags before the
  subcommand, so `git -C /repo push -f origin main`, `git --git-dir=... push -f`,
  `git -c k=v push --force`, `git --no-pager -C x reset --hard` and `git -C x stash` are denied.
- `block-destructive.sh` strips every quote from an `rm` target, so spliced forms
  (`rm -rf "$HOME"/`, `rm -rf "/"*`, `rm -rf ""/`) and `` rm -rf `pwd` `` are denied.
- Docs: ADR-007 lists `restrict-tester-bash.sh` among the hooks, the design spec's hooks table
  records MultiEdit on the `block-secrets.sh` matcher, and ADR-003 notes that the tester Bash
  guard is a deny-list, not a sandbox.
