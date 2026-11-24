#!/usr/bin/env bash
# PreToolUse guard for Edit/Write/MultiEdit/Read:
#  - deny any access to .env* files, except the documented templates
#    (.env.example, .env.sample, .env.template, .env.dist) and direnv's .envrc,
#    which holds shell setup, not secrets
#  - deny writing content that looks like a credential
set -euo pipefail

# Fail closed: without jq the guard cannot read its input. Exit 2 is the blocking
# PreToolUse error, so the call is refused with this message instead of slipping through.
if ! command -v jq >/dev/null 2>&1; then
  echo "ai-engineering-system: jq is not installed, so block-secrets.sh cannot evaluate this call. Install jq (https://jqlang.github.io/jq/) and retry." >&2
  exit 2
fi

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
case "$tool" in Edit|Write|MultiEdit|Read|NotebookEdit) ;; *) exit 0 ;; esac

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

path="$(jq -r '(.tool_input | objects | (.file_path // .notebook_path)) // empty' <<<"$input")"
base="$(basename -- "$path")"
case "$base" in
  .env.example | .env.sample | .env.template | .env.dist | .envrc) ;;
  .env*) deny "Access to ${base} is blocked. Secrets stay out of agent reach; document variables in .env.example instead." ;;
esac

[[ "$tool" == "Read" ]] && exit 0

# Content for Write is .content; for Edit is .new_string; MultiEdit carries .edits[].new_string;
# NotebookEdit carries .new_source.
content="$(jq -r '[(.tool_input | objects | .content?), (.tool_input | objects | .new_string?), (.tool_input | objects | .new_source?), (.tool_input | objects | .edits? | arrays | .[] | objects | .new_string?)] | map(select(. != null)) | join("\n")' <<<"$input")"
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
check 'xox[baprs]-[0-9A-Za-z-]{10,}'                                 'a Slack token'
# A real key mixes digits in; an all-letter placeholder such as sk-proj-xxxx... is documentation.
check 'sk-(proj-)?[A-Za-z0-9_-]{20,}[0-9][A-Za-z0-9_-]{5,}'          'an OpenAI-style API key'
check '[sr]k_(live|test)_[0-9a-zA-Z]{24,}'                          'a Stripe key'
check 'AIza[0-9A-Za-z_-]{35}'                                        'a Google API key'

exit 0
