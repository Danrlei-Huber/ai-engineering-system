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
  # An optional <case>.reason holds text the deny reason must contain, so a
  # refusal is not just a refusal but the right one.
  reason_file="${fixture%.json}.reason"
  if [[ "$got" == "$expected" && -f "$reason_file" ]]; then
    want_reason="$(tr -d '\n' < "$reason_file")"
    got_reason="$(printf '%s' "$output" | jq -r '.hookSpecificOutput.permissionDecisionReason // ""')"
    [[ "$got_reason" == *"$want_reason"* ]] || got="${expected} but the reason lacks \"${want_reason}\": ${got_reason}"
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

# session-banner.sh prints context, not a decision: check the version line, the
# workflow list (derived from skills/workflows/) and the setup warning, which
# must appear for a project without permissions.deny rules and only then.
plugin_root="$(cd ../.. && pwd)"
banner_check() { # banner_check <label> <cwd> <must-contain> <must-not-contain>
  local out
  out="$(printf '{"hook_event_name":"SessionStart","cwd":"%s"}' "$2" | CLAUDE_PLUGIN_ROOT="$plugin_root" bash ../scripts/session-banner.sh 2>&1)" || { fail=$((fail + 1)); echo "FAIL banner ${1}: exit code $?"; return; }
  if [[ "$out" == *"$3"* && ( -z "$4" || "$out" != *"$4"* ) ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL banner ${1}: expected output to contain \"${3}\"${4:+ and not \"$4\"}"
    echo "     output: ${out}"
  fi
}
plugin_version="$(jq -r .version "$plugin_root/.claude-plugin/plugin.json")"
bare_project="$(mktemp -d)"
banner_check "version line" "$bare_project" "[ai-engineering-system v${plugin_version}]" ""
for w in "$plugin_root"/skills/workflows/*/; do
  banner_check "workflow /$(basename "$w")" "$bare_project" "/$(basename "$w")" ""
done
banner_check "setup warning without deny rules" "$bare_project" "/setup-project" ""
mkdir -p "$bare_project/.claude"
echo '{"permissions":{"deny":["WebFetch"]}}' > "$bare_project/.claude/settings.json"
banner_check "no setup warning with deny rules" "$bare_project" "[ai-engineering-system v" "permissions.deny"
rm -rf "$bare_project"

echo "hooks: ${pass} passed, ${fail} failed"
[[ "$fail" -eq 0 ]]
