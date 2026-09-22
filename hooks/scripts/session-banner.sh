#!/usr/bin/env bash
# SessionStart hook: print plugin version and setup warnings. Stdout becomes context for Claude.
set -euo pipefail

root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
input="$(cat || true)"
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null || true)"
[[ -n "$cwd" ]] || cwd="$PWD"

version="$(jq -r '.version // "unknown"' "$root/.claude-plugin/plugin.json" 2>/dev/null || echo unknown)"
echo "[ai-engineering-system v${version}] active. Workflows: /implement-feature, /review, /research, /setup-project, /ingest-knowledge."

if [[ ! -f "$root/rag/dist/server.js" ]]; then
  echo "[ai-engineering-system] RAG server is not built; research and architect agents will run without the knowledge base. Build it with: cd \"$root/rag\" && npm ci && npm run build"
fi

settings="$cwd/.claude/settings.json"
if [[ ! -f "$settings" ]] || ! jq -e '(.permissions.deny // []) | length > 0' "$settings" >/dev/null 2>&1; then
  echo "[ai-engineering-system] This project has no permissions.deny rules. Run /setup-project to scaffold CLAUDE.md, .claude/settings.json and .ai-engineering/project.yaml."
fi
exit 0
