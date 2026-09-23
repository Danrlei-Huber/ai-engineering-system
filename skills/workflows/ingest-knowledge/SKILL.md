---
name: ingest-knowledge
description: Index the current project's Markdown docs and ADRs (or a given path) into the RAG knowledge base by running the rag/ CLI. Ingestion is the only write path into the knowledge base.
disable-model-invocation: true
argument-hint: [path] [--collection docs|decisions|standards|external] [--prune]
allowed-tools: Bash(node *rag/dist/cli/ingest.js *) Bash(node *rag/dist/cli/doctor.js *) Bash(ls *) Bash(cat *)
---

# /ingest-knowledge

Arguments: $ARGUMENTS
Project file:
!`cat .ai-engineering/project.yaml 2>/dev/null || echo "(no .ai-engineering/project.yaml)"`
Candidate docs:
!`ls -d docs docs/decisions README.md 2>/dev/null || true`

Rules: the skill resolves paths and calls the CLI; it never re-implements ingestion.

1. Resolve `PROJECT` from `project.yaml`. If missing, stop and tell the user to run `/setup-project` (or pass a project explicitly is not supported here on purpose).
2. Check readiness: `node "${CLAUDE_PLUGIN_ROOT}/rag/dist/cli/doctor.js"`. If it exits non-zero, show its output and stop; the fix is always in that output (compose up, migrate, build, pull model).
3. Decide targets:
   - If a path was given: one run with that path and `--collection` from the arguments (default `docs`), plus `--prune` if given.
   - Otherwise the default set, each as its own run: `docs/decisions` → `decisions` (if it exists); `docs` → `docs` (if it exists; ADRs inside are skipped as unchanged duplicates only if already ingested under `decisions`, so run `decisions` first); `README.md` → `docs` (if it exists).
4. Run from the project root so stored paths are repo-relative:
   `node "${CLAUDE_PLUGIN_ROOT}/rag/dist/cli/ingest.js" --project <PROJECT> --collection <c> [--prune] <path>`
5. Report per run: ingested, skipped, pruned counts and any error verbatim.
