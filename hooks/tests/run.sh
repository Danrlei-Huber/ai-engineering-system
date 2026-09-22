#!/usr/bin/env bash
# Fixture-driven tests for hook scripts.
# For each cases/<script>/<case>.json, pipe it to scripts/<script>.sh and compare
# the permission decision with cases/<script>/<case>.expect ("allow" or "deny").
set -euo pipefail
cd "$(dirname "$0")"

pass=0
fail=0
for fixture in cases/*/*.json; do
  script_name="$(basename "$(dirname "$fixture")")"
  script="../scripts/${script_name}.sh"
  expect_file="${fixture%.json}.expect"
  expected="$(tr -d '[:space:]' < "$expect_file")"

  err_file="$(mktemp)"
  rc=0
  output="$(bash "$script" < "$fixture" 2>"$err_file")" || rc=$?
  stderr="$(cat "$err_file")"
  rm -f "$err_file"

  if [[ "$rc" -ne 0 ]]; then
    # A crashing hook script must never be reported as an allow.
    got="crash(rc=${rc})"
  elif [[ -z "$output" ]]; then
    got="allow"
  else
    got="$(printf '%s' "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"')"
  fi

  if [[ "$got" == "$expected" ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL ${fixture}: expected ${expected}, got ${got}"
    [[ -n "$output" ]] && echo "     output: ${output}"
    [[ -n "$stderr" ]] && echo "     stderr: ${stderr}"
  fi
done

echo "hooks: ${pass} passed, ${fail} failed"
[[ "$fail" -eq 0 ]]
