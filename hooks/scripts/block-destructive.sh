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

# Fail closed: without jq the guard cannot read its input. Exit 2 is the blocking
# PreToolUse error, so the call is refused with this message instead of slipping through.
if ! command -v jq >/dev/null 2>&1; then
  echo "ai-engineering-system: jq is not installed, so block-destructive.sh cannot evaluate this call. Install jq (https://jqlang.github.io/jq/) and retry." >&2
  exit 2
fi

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input")"
[[ "$tool" == "Bash" ]] || exit 0
cmd="$(jq -r '(.tool_input | objects | .command) // empty' <<<"$input")"
[[ -n "$cmd" ]] || exit 0

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

# Collapse whitespace so patterns stay simple. A newline ends a command like
# `;` does, so it is turned into one first instead of vanishing into a space.
norm="$(tr -s '[:space:]' ' ' <<<"${cmd//$'\n'/ ; }")"
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
if ! grep -Eq '(^|[^[:alnum:]_.-])(rm|git|kubectl|terraform|docker-compose|docker|find|psql|pgcli|mysql|mariadb|mycli|sqlite3|sqlcmd|cockroach|clickhouse-client|duckdb)([^[:alnum:]_.-]|$)' <<<"$norm"; then
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
# `sep[i]` is 1 when token i ends a simple command (`;`, `&&`, `||`, `|`, `&`,
# alone or glued to the token: `main;`). Argument scans stop there, so the
# flags of a later command on the same line are not read as this one's.
sep=()
for ((i = 0; i < ntok; i++)); do
  case "${tokens[i]}" in
    ';' | '&&' | '||' | '|' | '&' | *';' | *'&&' | *'||' | *'|' | *'&') sep[i]=1 ;;
    *) sep[i]=0 ;;
  esac
  s="${tokens[i]}"
  s="${s##*[\(\`]}"
  s="${s#\\}" # `\rm` skips a shell alias, not this guard
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
  [[ "${sep[i]}" -eq 0 ]] || continue

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
        [[ "${sep[j]}" -eq 1 ]] && break
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
  # `//` is still the root; `../..` and `../../../` still climb out of the project.
  if [[ "$target" =~ ^/+$ || "$target" =~ ^(\.\./)*\.\./?$ ]]; then dangerous=1; fi

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
# Also catches deleting that ref on the remote: `--delete`/`-d`, or the empty
# source refspec `:main`.
for ((i = 0; i + 1 < ntok; i++)); do
  [[ "${cw[i]}" == "git" || "${cw[i]}" == */git ]] || continue
  subcommand_after_flags $((i + 1)) push reset clean branch
  [[ "$sub_word" == "push" && "${sep[sub_index]}" -eq 0 ]] || continue

  forced=0
  deleting=0
  hits_main=0
  for ((j = sub_index + 1; j < ntok; j++)); do
    arg="${aw[j]}"
    ref=""
    case "$arg" in
      --force-with-lease*) ;;
      --force) forced=1 ;;
      --delete) deleting=1 ;;
      --*) ;;
      -?*)
        [[ "$arg" == *f* ]] && forced=1
        [[ "$arg" == *d* ]] && deleting=1
        ;;
      +*) forced=1; ref="${arg#+}" ;;
      *) ref="$arg" ;;
    esac
    if [[ -z "$ref" ]]; then
      [[ "${sep[j]}" -eq 1 ]] && break
      continue
    fi
    dst="${ref##*:}"
    case "$dst" in
      main | master | */main | */master)
        hits_main=1
        [[ "$ref" == :* ]] && deleting=1
        ;;
    esac
    [[ "${sep[j]}" -eq 1 ]] && break
  done

  if [[ "$forced" -eq 1 && "$hits_main" -eq 1 ]]; then
    deny "Force push to main/master is blocked."
  fi
  if [[ "$deleting" -eq 1 && "$hits_main" -eq 1 ]]; then
    deny "Deleting main/master on the remote is blocked."
  fi
done

# --- git reset --hard ------------------------------------------------------
# Catches: `git reset ... --hard`, including behind git global flags
# (`git --no-pager -C x reset --hard`). Requires `reset` to be the git
# subcommand, so `git log --grep "reset --hard"` is not mistaken for one.
for ((i = 0; i + 1 < ntok; i++)); do
  [[ "${cw[i]}" == "git" || "${cw[i]}" == */git ]] || continue
  subcommand_after_flags $((i + 1)) push reset clean branch
  [[ "$sub_word" == "reset" && "${sep[sub_index]}" -eq 0 ]] || continue
  for ((j = sub_index + 1; j < ntok; j++)); do
    if [[ "${aw[j]}" == "--hard" ]]; then
      deny "git reset --hard is blocked because it discards uncommitted work. Use git stash or ask the user."
    fi
    [[ "${sep[j]}" -eq 1 ]] && break
  done
done

# --- git clean -f / git branch -D main --------------------------------------
# Catches: `git clean` with force (git refuses to clean without it), because the
# untracked files it removes may be work not yet committed; and deleting the
# main/master branch with `-D`, `-d` or `--delete`.
for ((i = 0; i + 1 < ntok; i++)); do
  [[ "${cw[i]}" == "git" || "${cw[i]}" == */git ]] || continue
  subcommand_after_flags $((i + 1)) push reset clean branch
  [[ "${sep[sub_index]}" -eq 0 ]] || continue
  case "$sub_word" in
    clean)
      for ((j = sub_index + 1; j < ntok; j++)); do
        arg="${aw[j]}"
        if [[ "$arg" == "--force" || ( "$arg" == -[!-]* && "$arg" == *f* ) ]]; then
          deny "git clean -f removes untracked files, which may be uncommitted work. Ask the user to run it."
        fi
        [[ "${sep[j]}" -eq 1 ]] && break
      done
      ;;
    branch)
      deleting=0
      names_main=0
      for ((j = sub_index + 1; j < ntok; j++)); do
        arg="${aw[j]}"
        case "$arg" in
          --delete) deleting=1 ;;
          --*) ;;
          -[!-]*) [[ "$arg" == *[dD]* ]] && deleting=1 ;;
          main | master) names_main=1 ;;
        esac
        [[ "${sep[j]}" -eq 1 ]] && break
      done
      if [[ "$deleting" -eq 1 && "$names_main" -eq 1 ]]; then
        deny "Deleting the main/master branch is blocked."
      fi
      ;;
  esac
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

# --- docker ------------------------------------------------------------------
# Catches what deletes data volumes (databases, models; the RAG's own among them):
# `docker system prune`, `docker volume prune|rm`, and `docker compose down -v`
# (or `--volumes`), also spelled `docker-compose down -v`.
for ((i = 0; i < ntok; i++)); do
  compose_sub=""
  compose_index=-1
  case "${cw[i]}" in
    docker-compose | */docker-compose)
      subcommand_after_flags $((i + 1)) down
      compose_sub="$sub_word"
      compose_index="$sub_index"
      ;;
    docker | */docker)
      subcommand_after_flags $((i + 1)) compose volume system
      case "$sub_word" in
        compose)
          subcommand_after_flags $((sub_index + 1)) down
          compose_sub="$sub_word"
          compose_index="$sub_index"
          ;;
        volume)
          subcommand_after_flags $((sub_index + 1)) prune rm
          case "$sub_word" in
            prune | rm) deny "docker volume ${sub_word} is blocked: volumes hold databases and models. Ask the user to run it." ;;
          esac
          ;;
        system)
          subcommand_after_flags $((sub_index + 1)) prune
          if [[ "$sub_word" == "prune" ]]; then deny "docker system prune is blocked."; fi
          ;;
      esac
      ;;
    *) continue ;;
  esac
  [[ "$compose_sub" == "down" && "${sep[compose_index]}" -eq 0 ]] || continue
  for ((j = compose_index + 1; j < ntok; j++)); do
    arg="${aw[j]}"
    if [[ "$arg" == "--volumes" || ( "$arg" == -[!-]* && "$arg" == *v* ) ]]; then
      deny "docker compose down with volumes is blocked: it deletes the data volumes. Run it without -v, or ask the user."
    fi
    [[ "${sep[j]}" -eq 1 ]] && break
  done
done

# --- find -delete from the root or home ---------------------------------------
# Catches: `find` whose starting point is the filesystem root or the home
# directory and whose expression contains `-delete`. A specific sub-path is fine.
for ((i = 0; i < ntok; i++)); do
  [[ "${cw[i]}" == "find" || "${cw[i]}" == */find ]] || continue
  [[ "${sep[i]}" -eq 0 ]] || continue
  start=""
  has_delete=0
  for ((j = i + 1; j < ntok; j++)); do
    arg="${aw[j]}"
    [[ "$arg" == "-delete" ]] && has_delete=1
    [[ -z "$start" && "$arg" != -* ]] && start="$arg"
    [[ "${sep[j]}" -eq 1 ]] && break
  done
  [[ "$has_delete" -eq 1 && -n "$start" ]] || continue
  # shellcheck disable=SC2016,SC2088  # literal, unexpanded argument spellings
  case "$start" in
    '/' | '/*' | '~' | '~/' | '$HOME' | '${HOME}' | '$HOME/' | '${HOME}/')
      deny "find -delete from the filesystem root or the home directory is blocked. Start from a specific sub-path." ;;
  esac
  if [[ "$start" =~ ^/+$ ]]; then deny "find -delete from the filesystem root is blocked."; fi
done

exit 0
