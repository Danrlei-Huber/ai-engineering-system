#!/usr/bin/env bash
# PreToolUse guard, wired plugin-wide in hooks/hooks.json: the tester may only write test files.
# Allowed: **/tests/**, **/test/**, **/__tests__/**, *.test.*, *.spec.*, test_*.py, *_test.go,
#          and .ai-engineering/runs/** (run records). Any other dot-directory is refused.
# Agent-frontmatter hooks are ignored for plugin agents (Claude Code 2.1.x), so this hook runs
# for every Edit/Write/MultiEdit and gates itself on the calling agent's identity: the top-level
# `agent_type` field of the PreToolUse hook input. It exits 0 (allow) for the main session
# (no `agent_type`) and for any subagent that is not the tester, matching either the prefixed
# form (`ai-engineering-system:tester`) or a bare `tester`.
set -euo pipefail

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
case "$tool" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac

agent_type="$(jq -r '.agent_type // empty' <<<"$input")"
case "$agent_type" in tester|*:tester) ;; *) exit 0 ;; esac

path="$(jq -r '(.tool_input | objects | .file_path) // empty' <<<"$input")"
[[ -n "$path" ]] || exit 0
cwd="$(jq -r '.cwd // empty' <<<"$input")"

rel="$path"
if [[ -n "$cwd" && "$path" == "$cwd/"* ]]; then rel="${path#"$cwd"/}"; fi
rel="${rel#./}"

# Deny path traversal attempts
if [[ "$rel" =~ ^\.\.\/ ]] || [[ "$rel" =~ /\.\./ ]] || [[ "$rel" =~ /\.\.$ ]] || [[ "$rel" == ".." ]]; then
  jq -n --arg p "$rel" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("Path traversal is not allowed for the tester agent. Refused: " + $p + ".")}}'
  exit 0
fi

# Deny absolute paths outside the project directory
if [[ -n "$cwd" && "$path" == /* ]] && [[ "$path" != "$cwd/"* ]]; then
  jq -n --arg p "$rel" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("The tester agent may only write inside the project directory. Refused: " + $p + ".")}}'
  exit 0
fi

base="$(basename -- "$rel")"

# Dot-directories at the repo root hold tooling configuration (.github, .git,
# .husky), never tests, so a test-looking name inside one is still a refusal.
# The single exception is the plugin's own run records.
first_segment="${rel%%/*}"
if [[ "$first_segment" == .?* && "$first_segment" != ".." ]]; then
  if [[ "$first_segment" != ".ai-engineering" || "$rel" != .ai-engineering/runs/* ]]; then
    jq -n --arg p "$rel" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("The tester agent may not write into dot-directories; only .ai-engineering/runs/** is allowed. Refused: " + $p + ".")}}'
    exit 0
  fi
fi

allowed=0
case "/$rel" in
  /tests/*|/test/*|*/tests/*|*/test/*|*/__tests__/*|/.ai-engineering/runs/*) allowed=1 ;;
esac
case "$base" in
  *.test.*|*.spec.*|test_*.py|*_test.go) allowed=1 ;;
esac

if [[ "$allowed" -eq 0 ]]; then
  jq -n --arg p "$rel" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("The tester agent may only write test files (tests/**, *.test.*, *.spec.*). Refused: " + $p + ". Report the needed production change in the test-result contract instead.")}}'
fi
exit 0
