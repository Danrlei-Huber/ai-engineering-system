#!/usr/bin/env bash
# SessionStart hook: print plugin version and setup warnings. Stdout becomes context for Claude.
set -euo pipefail

root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"

# The guard hooks need jq and fail closed without it (exit 2 on every Bash,
# Edit, Write and Read call), so say so up front rather than one refusal at a time.
if ! command -v jq >/dev/null 2>&1; then
  echo "[ai-engineering-system] WARNING: jq is not installed. The guard hooks fail closed, so every Bash, Edit, Write and Read call will be refused until jq is installed (https://jqlang.github.io/jq/)."
fi
input="$(cat || true)"
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null || true)"
[[ -n "$cwd" ]] || cwd="$PWD"

version="$(jq -r '.version // "unknown"' "$root/.claude-plugin/plugin.json" 2>/dev/null || echo unknown)"
# The workflow list is read from skills/workflows/ so a new orchestrator shows up by itself.
workflows=""
for dir in "$root"/skills/workflows/*/; do
  [[ -d "$dir" ]] || continue
  workflows="${workflows:+$workflows, }/$(basename "$dir")"
done
echo "[ai-engineering-system v${version}] active. Workflows: ${workflows:-none found}."

if [[ ! -f "$root/rag/dist/server.js" ]]; then
  echo "[ai-engineering-system] RAG server is not built; research and architect agents will run without the knowledge base. Build it with: cd \"$root/rag\" && npm ci && npm run build"
fi

# project.yaml carries the plugin version /setup-project scaffolded it with; templates may have moved since.
project_yaml="$cwd/.ai-engineering/project.yaml"
if [[ -f "$project_yaml" ]]; then
  scaffolded="$(sed -n '/^ai_engineering_system:/,/^[^[:space:]]/{s/^[[:space:]]*version:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/p}' "$project_yaml" 2>/dev/null | head -1)"
  if [[ -n "$scaffolded" && "$scaffolded" != "$version" ]]; then
    echo "[ai-engineering-system] .ai-engineering/project.yaml was scaffolded by ai-engineering-system v${scaffolded}; this is v${version}. Re-run /setup-project to review CLAUDE.md and the deny rules for changes (it never overwrites)."
  fi
fi

settings="$cwd/.claude/settings.json"
if [[ ! -f "$settings" ]] || ! jq -e '(.permissions.deny // []) | length > 0' "$settings" >/dev/null 2>&1; then
  echo "[ai-engineering-system] This project has no permissions.deny rules. Run /setup-project to scaffold CLAUDE.md, .claude/settings.json and .ai-engineering/project.yaml."
fi
exit 0
