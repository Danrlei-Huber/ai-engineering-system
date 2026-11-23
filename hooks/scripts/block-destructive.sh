#!/usr/bin/env bash
# PreToolUse guard for Bash: deny destructive commands deterministically.
# Input: hook JSON on stdin. Output: deny JSON, or nothing to allow.
#
# The matchers are token-based rather than regex-over-the-whole-string: the
# command is split on whitespace, each token is stripped of its shell
# punctuation, and the matchers then reason about the command word and its
# arguments. That is what lets `rm -rf -- /` and `rm -rf "$HOME"` be denied
# while `rm -rf -- node_modules` and `rm -rf "$HOME/.cache/foo"` are allowed.
#
# Every token is normalised exactly once, in plain bash, into the `cw` (command
# word) and `aw` (argument) arrays. The matchers then only index those arrays:
# a long command must stay far inside the 10 s hook timeout, because a timed-out
# hook does not block (see tests/run.sh for the budget).
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
norm="${norm# }"
norm="${norm% }"

# Ruling 16: a bare read-only utility cannot destroy anything, so a command that
# merely *mentions* a destructive string (grep for "rm -rf", echo a warning) is
# allowed -- but only when it is a single un-chained, un-redirected command. A
# newline is a separator too, so it is checked on the original command, before
# the whitespace collapse above turned it into a space.
first_word="${norm%% *}"
case "$first_word" in
  grep|rg|echo|printf|cat|head|tail|less)
    # shellcheck disable=SC2016  # these are literal shell metacharacters, not expansions
    case "$cmd" in
      *'|'* | *';'* | *'&'* | *'$('* | *'`'* | *'>'* | *$'\n'*) ;;
      *) exit 0 ;;
    esac
    ;;
esac

# Fast path: no matcher below can fire unless one of its command words appears
# somewhere in the command, so most commands never reach the token loops.
if ! grep -Eq '(^|[^[:alnum:]_.-])(rm|git|kubectl|terraform|docker|psql|pgcli|mysql|mariadb|mycli|sqlite3|sqlcmd|cockroach|clickhouse-client|duckdb)([^[:alnum:]_.-]|$)' <<<"$norm"; then
  exit 0
fi

# Split on whitespace and normalise each token once, two ways.
#
# Command word (`cw`): drop leading quotes, sub-shell / substitution openers and
# separators, and a trailing quote. `$(rm`, `"rm`, `/bin/rm` and `./rm` all
# reduce to something ending in `rm`.
#
# Argument (`aw`): drop *every* quote character plus any trailing shell
# separator, so `"$HOME"`, `'/'`, `/"`, `/)` and spliced forms such as
# `"$HOME"/`, `"/"*` and `""/` all reduce to the payload the shell would pass.
# A trailing `)` that closes a substitution the token itself opened is part of
# the argument (`$(pwd)`); otherwise it is a sub-shell terminator.
read -r -a tokens <<<"$norm"
ntok="${#tokens[@]}"
cw=()
aw=()
for ((i = 0; i < ntok; i++)); do
  s="${tokens[i]}"
  s="${s##*[\(\`]}"
  while [[ -n "$s" && "$s" == [\"\'\$\;\&\|]* ]]; do s="${s#?}"; done
  s="${s%[\"\']}"
  cw[i]="$s"
  s="${tokens[i]}"
  s="${s//\"/}"
  s="${s//\'/}"
  [[ "$s" == *'('* ]] || s="${s%[\)\;\&\|]}"
  aw[i]="$s"
done

# Find the subcommand of a tool that accepts global flags before it
# (`git -C /repo push`, `kubectl -n prod delete`, `terraform -chdir=x destroy`).
# Sets `sub_word` to that token and `sub_index` to its position, so callers can
# keep parsing the subcommand's own arguments. Flags spelled `--flag=value`
# carry their value; a flag given a separate value swallows the next token
# unless that token is itself a flag or one of the <wanted> subcommands -- so
# `git --no-pager -C x reset` and `kubectl --context prod delete` both resolve.
# Globals rather than stdout: a command substitution would lose `sub_index`.
sub_word=""
sub_index=-1
subcommand_after_flags() { # subcommand_after_flags <start-index> <wanted>...
  local k="$1" arg next want skip
  shift
  sub_word=""
  sub_index=-1
  while ((k < ntok)); do
    arg="${aw[k]}"
    case "$arg" in
      -*)
        k=$((k + 1))
        if [[ "$arg" != *=* && k -lt ntok ]]; then
          next="${aw[k]}"
          skip=0
          if [[ "$next" == -* ]]; then skip=1; fi
          for want in "$@"; do
            if [[ "$next" == "$want" ]]; then skip=1; fi
          done
          if [[ "$skip" -eq 0 ]]; then k=$((k + 1)); fi # the flag's value
        fi
        ;;
      *)
        sub_word="$arg"
        sub_index="$k"
        return 0
        ;;
    esac
  done
  return 0
}

# --- rm ------------------------------------------------------------------
# Catches: recursive+force (or --no-preserve-root) deletes whose first
# non-flag argument is the filesystem root, the home directory, the current
# directory, the parent directory or a bare glob -- in any flag order and
# through any quoting of the target.
for ((i = 0; i < ntok; i++)); do
  [[ "${cw[i]}" == "rm" || "${cw[i]}" == */rm ]] || continue

  recursive=0
  force=0
  no_preserve=0
  target=""
  for ((j = i + 1; j < ntok; j++)); do
    arg="${aw[j]}"
    case "$arg" in
      --) continue ;;
      --recursive) recursive=1; continue ;;
      --force) force=1; continue ;;
      --no-preserve-root) no_preserve=1; continue ;;
      --*) continue ;;
      -?*)
        [[ "$arg" == *[rR]* ]] && recursive=1
        [[ "$arg" == *[fF]* ]] && force=1
        continue
        ;;
    esac
    target="$arg"
    break
  done
  [[ -n "$target" ]] || continue

  dangerous=0
  # shellcheck disable=SC2016,SC2088  # these are literal, unexpanded argument spellings
  case "$target" in
    '/' | '/*' | '~' | '~/' | '~/*' \
    | '$HOME' | '${HOME}' | '$HOME/' | '${HOME}/' | '$HOME/*' | '${HOME}/*' \
    | '$PWD' | '${PWD}' | '$(pwd)' | '`pwd`' \
    | '.' | './' | './*' | '*' | '..' | '../') dangerous=1 ;;
  esac

  if [[ "$no_preserve" -eq 1 && "$dangerous" -eq 1 ]]; then
    deny "rm --no-preserve-root against ${target} is blocked. Delete a specific sub-path instead."
  fi
  if [[ "$recursive" -eq 1 && "$force" -eq 1 && "$dangerous" -eq 1 ]]; then
    deny "Recursive force delete of a root, home or project directory is blocked. Delete a specific sub-path instead."
  fi
  if [[ "$recursive" -eq 1 && ( "$target" == "/" || "$target" == "/*" ) ]]; then
    deny "Recursive delete of the filesystem root is blocked."
  fi
done

# --- git push --force to main/master --------------------------------------
# Catches: a forced push (-f in any short cluster, --force, or a leading `+`
# on the refspec; --force-with-lease excluded) whose destination ref is main
# or master, including `HEAD:main`, `main:main`, `+main`, `:main` and
# `origin/main` -- behind any git global flags (`git -C /repo push -f main`).
for ((i = 0; i + 1 < ntok; i++)); do
  [[ "${cw[i]}" == "git" || "${cw[i]}" == */git ]] || continue
  subcommand_after_flags $((i + 1)) push reset
  [[ "$sub_word" == "push" ]] || continue

  forced=0
  hits_main=0
  for ((j = sub_index + 1; j < ntok; j++)); do
    arg="${aw[j]}"
    ref=""
    case "$arg" in
      --force-with-lease*) continue ;;
      --force) forced=1; continue ;;
      --*) continue ;;
      -?*) [[ "$arg" == *f* ]] && forced=1; continue ;;
      +*) forced=1; ref="${arg#+}" ;;
      *) ref="$arg" ;;
    esac
    dst="${ref##*:}"
    case "$dst" in
      main | master | */main | */master) hits_main=1 ;;
    esac
  done

  if [[ "$forced" -eq 1 && "$hits_main" -eq 1 ]]; then
    deny "Force push to main/master is blocked."
  fi
done

# --- git reset --hard ------------------------------------------------------
# Catches: `git reset ... --hard`, including behind git global flags
# (`git --no-pager -C x reset --hard`). Requires `reset` to be the git
# subcommand, so `git log --grep "reset --hard"` is not mistaken for one.
for ((i = 0; i + 1 < ntok; i++)); do
  [[ "${cw[i]}" == "git" || "${cw[i]}" == */git ]] || continue
  subcommand_after_flags $((i + 1)) push reset
  [[ "$sub_word" == "reset" ]] || continue
  for ((j = sub_index + 1; j < ntok; j++)); do
    if [[ "${aw[j]}" == "--hard" ]]; then
      deny "git reset --hard is blocked because it discards uncommitted work. Use git stash or ask the user."
    fi
  done
done

# --- destructive SQL -------------------------------------------------------
# Catches: DROP TABLE/DATABASE/SCHEMA or TRUNCATE; applies only when the command
# invokes a SQL client (psql, mysql, sqlite3, ...), whether in a -c/-e payload,
# piped on stdin or behind `docker exec`. A commit message or a test filter that
# merely mentions such a statement invokes no client and is allowed.
sql_client=0
for ((i = 0; i < ntok; i++)); do
  case "${cw[i]}" in
    psql | */psql | pgcli | */pgcli | mysql | */mysql | mariadb | */mariadb | mycli | */mycli \
    | sqlite3 | */sqlite3 | sqlcmd | */sqlcmd | cockroach | */cockroach \
    | clickhouse-client | */clickhouse-client | duckdb | */duckdb) sql_client=1 ;;
  esac
done
if [[ "$sql_client" -eq 1 ]] && grep -Eiq '(^|[^a-z_])(drop +(table|database|schema)|truncate( +table)?) +[a-z_"]' <<<"$norm"; then
  deny "Destructive SQL (DROP/TRUNCATE) is blocked. Write a reversible migration and ask the user."
fi

# --- kubectl delete / terraform destroy ------------------------------------
# Catches: the destructive subcommand behind any number of global flags, with
# or without separate values (`kubectl -n prod delete`, `terraform -chdir=x destroy`).
for ((i = 0; i < ntok; i++)); do
  case "${cw[i]}" in
    kubectl | */kubectl)
      subcommand_after_flags $((i + 1)) delete
      if [[ "$sub_word" == "delete" ]]; then deny "kubectl delete is blocked. Ask the user to run it."; fi
      ;;
    terraform | */terraform)
      subcommand_after_flags $((i + 1)) destroy
      if [[ "$sub_word" == "destroy" ]]; then deny "terraform destroy is blocked."; fi
      ;;
  esac
done

# --- docker system prune ---------------------------------------------------
# Catches: the whole-daemon prune, which removes volumes and images in use elsewhere.
if grep -Eq 'docker +system +prune' <<<"$norm"; then deny "docker system prune is blocked."; fi

exit 0
