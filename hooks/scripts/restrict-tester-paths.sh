#!/usr/bin/env bash
# PreToolUse guard declared in agents/tester.md: the tester may only write test files.
# Allowed: tests/**, test/**, **/__tests__/**, *.test.*, *.spec.*, test_*.py, *_test.go,
#          and .ai-engineering/** (run records).
set -euo pipefail

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
case "$tool" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac

path="$(jq -r '(.tool_input | objects | .file_path) // empty' <<<"$input")"
[[ -n "$path" ]] || exit 0
cwd="$(jq -r '.cwd // empty' <<<"$input")"

rel="$path"
if [[ -n "$cwd" && "$path" == "$cwd/"* ]]; then rel="${path#"$cwd"/}"; fi
rel="${rel#./}"
base="$(basename -- "$rel")"

allowed=0
case "/$rel" in
  /tests/*|/test/*|*/tests/*|*/test/*|*/__tests__/*|/.ai-engineering/*) allowed=1 ;;
esac
case "$base" in
  *.test.*|*.spec.*|test_*.py|*_test.go) allowed=1 ;;
esac

if [[ "$allowed" -eq 0 ]]; then
  jq -n --arg p "$rel" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("The tester agent may only write test files (tests/**, *.test.*, *.spec.*). Refused: " + $p + ". Report the needed production change in the test-result contract instead.")}}'
fi
exit 0
