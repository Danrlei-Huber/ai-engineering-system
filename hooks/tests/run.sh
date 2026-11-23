#!/usr/bin/env bash
# Fixture-driven tests for hook scripts.
# For each cases/<script>/<case>.json, pipe it to scripts/<script>.sh and compare
# the permission decision with cases/<script>/<case>.expect ("allow" or "deny").
set -euo pipefail
cd "$(dirname "$0")"

# Hooks run under a 10 s timeout (hooks/hooks.json) and a timed-out hook does not
# block, so a slow guard is a disabled guard. Every fixture must finish well inside it.
BUDGET_MS="${HOOK_BUDGET_MS:-3000}"
now_ms() { # 0 when the clock has no sub-second resolution (then the budget is not enforced)
  local n
  n="$(date +%s%N 2>/dev/null || true)"
  if [[ "$n" =~ ^[0-9]+$ ]]; then echo $((n / 1000000)); else echo 0; fi
}

pass=0
fail=0
for fixture in cases/*/*.json; do
  script_name="$(basename "$(dirname "$fixture")")"
  script="../scripts/${script_name}.sh"
  expect_file="${fixture%.json}.expect"
  expected="$(tr -d '[:space:]' < "$expect_file")"

  err_file="$(mktemp)"
  rc=0
  start_ms="$(now_ms)"
  output="$(bash "$script" < "$fixture" 2>"$err_file")" || rc=$?
  elapsed_ms=$(( $(now_ms) - start_ms ))
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
  if [[ "$got" == "$expected" && "$start_ms" -gt 0 && "$elapsed_ms" -gt "$BUDGET_MS" ]]; then
    got="${expected} but slow (${elapsed_ms} ms > ${BUDGET_MS} ms budget)"
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

# Without jq a guard cannot read its input. It must fail closed: exit 2 is the
# blocking error code for PreToolUse, so the tool call is refused with the
# script's stderr as the reason. Any other exit code would let the call through.
for script in ../scripts/block-destructive.sh ../scripts/block-secrets.sh ../scripts/restrict-tester-paths.sh ../scripts/restrict-tester-bash.sh; do
  rc=0
  PATH=/nonexistent /bin/bash "$script" < cases/block-destructive/npm-test.json >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -eq 2 ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL ${script} without jq: expected rc=2 (fail closed), got rc=${rc}"
  fi
done

echo "hooks: ${pass} passed, ${fail} failed"
[[ "$fail" -eq 0 ]]
