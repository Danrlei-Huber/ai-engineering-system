#!/usr/bin/env bash
# PreToolUse guard for Bash (Ruling 15): the tester agent may run tests, but may
# not write files through the shell. restrict-tester-paths.sh closes the
# Edit/Write/MultiEdit route; this hook closes the obvious Bash routes.
#
# Like restrict-tester-paths.sh it gates on the top-level `agent_type` field of
# the hook input, so it exits 0 (allow) for the main session and for every
# subagent that is not the tester (`tester` or `<plugin>:tester`).
#
# This is a deny-list of write-shaped commands, not a sandbox: it is
# deliberately conservative and blocks anything that looks like a write.
set -euo pipefail

# Fail closed: without jq the guard cannot read its input. Exit 2 is the blocking
# PreToolUse error, so the call is refused with this message instead of slipping through.
if ! command -v jq >/dev/null 2>&1; then
  echo "ai-engineering-system: jq is not installed, so restrict-tester-bash.sh cannot evaluate this call. Install jq (https://jqlang.github.io/jq/) and retry." >&2
  exit 2
fi

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
[[ "$tool" == "Bash" ]] || exit 0

agent_type="$(jq -r '.agent_type // empty' <<<"$input")"
case "$agent_type" in tester|*:tester) ;; *) exit 0 ;; esac

cmd="$(jq -r '(.tool_input | objects | .command) // empty' <<<"$input")"
[[ -n "$cmd" ]] || exit 0

deny() { # deny <what-was-detected>
  jq -n --arg reason "The tester agent may not write files through Bash (${1}). Write test files with Edit/Write instead, and report any needed production change in the test-result contract." \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

norm="$(tr -s '[:space:]' ' ' <<<"$cmd")"

# Output redirection. Strip the read-only stream plumbing the tester legitimately
# needs first (merging or discarding a stream, writing a message to stderr); any
# remaining `>` (including `>>`) is a write.
redir="$norm"
redir="${redir//2>&1/}"
redir="${redir//1>&2/}"
redir="${redir//>&2/}"
redir="${redir//2>\/dev\/null/}"
redir="${redir//&>\/dev\/null/}"
redir="${redir//> \/dev\/null/}"
redir="${redir//>\/dev\/null/}"
case "$redir" in
  *'>'*) deny "output redirection" ;;
esac

# File-writing utilities and git commands that overwrite the working tree.
if grep -Eq '(^|[^[:alnum:]_.-])tee( |$)' <<<"$norm"; then deny "tee"; fi
# In-place editors: `sed` with an `-i` anywhere among its flags (`-i`, `-i.bak`,
# `-ni`, `-E -i`, `-e '...' -i`, `--in-place`) and `perl -i` / `-pi` / `-pi.bak`.
# The flag is looked for token by token up to the next shell separator, because
# it need not be the first flag after the command word.
read -r -a words <<<"$norm"
editor=""
for word in "${words[@]}"; do
  w="${word#[\"\']}"
  case "$w" in
    sed | perl | */sed | */perl) editor="${w##*/}"; continue ;;
    '|' | '||' | '&&' | ';' | '|'* | *';' | *'&&' | *'||') editor=""; continue ;;
  esac
  [[ -n "$editor" ]] || continue
  # Globs, not regexes: `-i*` is `-i` and `-i.bak`; `-[a-zA-Z]*i` is a letter
  # cluster ending in i (`-ni`, `-Ei`, `-pi`); `-[a-zA-Z]*i.*` is that cluster
  # with a backup suffix (`-pi.bak`). `-Ilib` or `-e` match none of them.
  case "$w" in
    --in-place*) deny "${editor} in-place" ;;
    --*) ;;
    -i* | -[a-zA-Z]*i | -[a-zA-Z]*i.*) deny "${editor} in-place" ;;
  esac
done
if grep -Eq '(^|[^[:alnum:]_.-])(mv|cp|patch|rm|truncate|dd) +' <<<"$norm"; then deny "a file-writing utility"; fi
# Git global flags may sit between `git` and the subcommand (`git -C x stash`),
# so skip the value-taking and standalone globals before matching it.
if grep -Eq '(^|[^[:alnum:]_.-])git( +(-[cC] +[^ ]+|--git-dir=[^ ]+|--work-tree=[^ ]+|--namespace=[^ ]+|--no-pager|-[pP]))* +(checkout|restore|apply|stash)( |$)' <<<"$norm"; then deny "a git command that rewrites the working tree"; fi

exit 0
