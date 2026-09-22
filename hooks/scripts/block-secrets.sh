#!/usr/bin/env bash
# PreToolUse guard for Edit/Write/MultiEdit/Read:
#  - deny any access to .env* files except .env.example
#  - deny writing content that looks like a credential
set -euo pipefail

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
case "$tool" in Edit|Write|MultiEdit|Read) ;; *) exit 0 ;; esac

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
base="$(basename -- "$path")"
if [[ "$base" == .env* && "$base" != ".env.example" ]]; then
  deny "Access to ${base} is blocked. Secrets stay out of agent reach; document variables in .env.example instead."
fi

[[ "$tool" == "Read" ]] && exit 0

# Content for Write is .content; for Edit is .new_string; MultiEdit carries .edits[].new_string.
content="$(jq -r '[.tool_input.content?, .tool_input.new_string?, (.tool_input.edits? // [] | .[].new_string?)] | map(select(. != null)) | join("\n")' <<<"$input")"
[[ -n "$content" ]] || exit 0

check() { # check <regex> <label>
  if grep -Eq -- "$1" <<<"$content"; then
    deny "Content looks like a ${2}. Never write credentials into files; read them from the environment."
  fi
}
check 'AKIA[0-9A-Z]{16}'                                            'AWS access key'
check '-----BEGIN [A-Z ]*PRIVATE KEY-----'                          'private key'
check 'gh[pousr]_[A-Za-z0-9]{36,}'                                  'GitHub token'
check 'sk-ant-[A-Za-z0-9_-]{20,}'                                   'Anthropic API key'
check 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' 'JWT'

exit 0
