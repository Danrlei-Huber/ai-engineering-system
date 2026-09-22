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

path="$(jq -r '(.tool_input | objects | .file_path) // empty' <<<"$input")"
base="$(basename -- "$path")"
if [[ "$base" == .env* && "$base" != ".env.example" ]]; then
  deny "Access to ${base} is blocked. Secrets stay out of agent reach; document variables in .env.example instead."
fi

[[ "$tool" == "Read" ]] && exit 0

# Content for Write is .content; for Edit is .new_string; MultiEdit carries .edits[].new_string.
content="$(jq -r '[(.tool_input | objects | .content?), (.tool_input | objects | .new_string?), (.tool_input | objects | .edits? | arrays | .[] | objects | .new_string?)] | map(select(. != null)) | join("\n")' <<<"$input")"
[[ -n "$content" ]] || exit 0

# The label carries its own article so the deny sentence stays grammatical.
check() { # check <regex> <label-with-article>
  if grep -Eq -- "$1" <<<"$content"; then
    deny "Content looks like ${2}. Never write credentials into files; read them from the environment."
  fi
}
check 'AKIA[0-9A-Z]{16}'                                            'an AWS access key'
check '-----BEGIN [A-Z ]*PRIVATE KEY-----'                          'a private key'
check 'gh[pousr]_[A-Za-z0-9]{36,}'                                  'a GitHub token'
check 'sk-ant-[A-Za-z0-9_-]{20,}'                                   'an Anthropic API key'
check 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' 'a JWT'

exit 0
