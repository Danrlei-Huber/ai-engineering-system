---
name: setup-project
description: Scaffold a target project for the ai-engineering-system plugin: CLAUDE.md, .claude/settings.json deny rules and .ai-engineering/project.yaml. Never overwrites existing files.
disable-model-invocation: true
---

# /setup-project

Working directory: !`pwd`
Existing files:
!`ls -a CLAUDE.md .claude/settings.json .ai-engineering/project.yaml 2>/dev/null || true`
Stack hints:
!`ls package.json pyproject.toml requirements.txt pom.xml build.gradle go.mod Cargo.toml 2>/dev/null || true`

1. Determine values:
   - `PROJECT`: basename of the working directory.
   - `STACK`: from the hints (package.json → node plus the framework named in dependencies; pyproject/requirements → python; pom/gradle → java; go.mod → go; Cargo.toml → rust). Ask the user only if nothing is found.
   - `TEST_COMMAND`: `package.json` scripts.test → `npm test`; pyproject → `pytest`; pom → `mvn test`; gradle → `./gradlew test`; go.mod → `go test ./...`; Cargo → `cargo test`. Ask if unknown.
   - `PLUGIN_VERSION`: `version` from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.
2. Read the three templates in `${CLAUDE_SKILL_DIR}/templates/` and fill the `{{...}}` placeholders (`STACK_LINES` = one `- item` per stack entry; `STACK_YAML` = one `  - item` per entry).
3. For each target file:
   - If it does not exist, write it.
   - If it exists, do not overwrite. Show a unified diff of what you would add and ask the user whether to merge. For `.claude/settings.json`, merge means appending missing entries to `permissions.deny`.
4. Finish with the list of files written or proposed, and remind the user to run `/ingest-knowledge` once the RAG is up.
