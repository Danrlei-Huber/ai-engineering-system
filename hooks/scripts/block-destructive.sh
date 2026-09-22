#!/usr/bin/env bash
# PreToolUse guard for Bash: deny destructive commands deterministically.
# Input: hook JSON on stdin. Output: deny JSON, or nothing to allow.
set -euo pipefail

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
[[ "$tool" == "Bash" ]] || exit 0
cmd="$(jq -r '(.tool_input | objects | .command) // empty' <<<"$input")"
[[ -n "$cmd" ]] || exit 0

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

# Collapse whitespace so patterns stay simple.
norm="$(tr -s '[:space:]' ' ' <<<"$cmd")"

# rm -rf (any flag order, short or long) against /, /*, ~, $HOME, . or *
# Word boundary: rm must be preceded by start or non-[[:alnum:]_.--] character (allows / for path-qualified rm)
if grep -Eq "(^|[^[:alnum:]_.-][ ]*)rm[ ]+(-[a-zA-Z]*[rR][a-zA-Z]*[fF][a-zA-Z]*|-[a-zA-Z]*[fF][a-zA-Z]*[rR][a-zA-Z]*|-[rRfF]+[ ]+-[rRfF]+|--recursive[ ]+-[rRfF]+|-[rRfF]+[ ]+--force|--force[ ]+-[rRfF]+|-[rRfF]+[ ]+--recursive|--recursive[ ]+--force|--force[ ]+--recursive)[ ]+(/|/\\*|~|~/|\\\$HOME|\\.|\\./|\\*)([[:space:]]|[;&|()'\\\"]|$)" <<<"$norm"; then
  deny "Recursive force delete of a root, home or project directory is blocked. Delete a specific sub-path instead."
fi

# git push --force / -f to main or master (--force-with-lease is allowed)
if grep -Eq 'git +push +.*(--force|-f)( |$)' <<<"$norm" && grep -Eq '( |/)(main|master)( |[;&|]|$)' <<<"$norm"; then
  deny "Force push to main/master is blocked."
fi

# git reset --hard
if grep -Eq 'git +reset +.*--hard' <<<"$norm"; then
  deny "git reset --hard is blocked because it discards uncommitted work. Use git stash or ask the user."
fi

# Destructive SQL
if grep -Eiq '(^|[^a-z_])(drop +(table|database|schema)|truncate( +table)?) +[a-z_"]' <<<"$norm"; then
  deny "Destructive SQL (DROP/TRUNCATE) is blocked. Write a reversible migration and ask the user."
fi

# Infra
if grep -Eq 'kubectl +delete' <<<"$norm"; then deny "kubectl delete is blocked. Ask the user to run it."; fi
if grep -Eq 'terraform +destroy' <<<"$norm"; then deny "terraform destroy is blocked."; fi
if grep -Eq 'docker +system +prune' <<<"$norm"; then deny "docker system prune is blocked."; fi

exit 0
