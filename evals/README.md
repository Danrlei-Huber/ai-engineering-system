# Plugin evals

Run all: `claude plugin eval . --scaffold --trust-plugin --ablation none --threshold 0.8 --allow-tools Bash Write Edit --no-publish --max-cost-usd 20`
Run one: `claude plugin eval evals/<case>/case.yaml --scaffold --trust-plugin --ablation none --allow-tools Bash Write Edit --no-publish --max-cost-usd 5`
Baseline delta (doubles the runs): add `--ablation with-without`; the dispatch graders carry `arm: with-only`, so the no-plugin arm is not penalised for lacking the plugin's agents.
Tags: `workflow` (pipeline behaviour), `security` (hook enforcement).

Each case runs 3 times (`runs: 3`, the documented default for confirming a change). `--no-publish` keeps
the HTML report local; without it the runner tries to publish it to claude.ai. `--max-cost-usd` bounds a
runaway run: the pipeline case allows 40 turns per run.

CI: the `evals` job runs weekly (Monday 06:00 UTC, with the baseline arm) and on `workflow_dispatch`
(arm selectable). It fails fast with an explicit error when the `ANTHROPIC_API_KEY` repository secret
is missing, instead of letting every case die with "Not logged in". It pins `--model` and
`--judge-model`, so a model rollout does not read as a plugin regression.

`expected_outcome` in a prompt's frontmatter is documentation for humans; the runner does not grade it.
`allowed_tools` in `case.yaml` grants only the read-only tools; Bash, Edit and Write always come from
`--allow-tools`. The six "have no mock and are NOT started" lines at the start of a run are expected:
the plugin's MCP servers are withheld on purpose, and `research-degrades-without-rag` relies on that.

Plugin hooks run inside `claude plugin eval` only when `--trust-plugin` is passed; without it the security cases fail. The `agent_type` hook-input field was verified on Claude Code 2.1.280 and 2.1.330 and must be re-verified on CLI upgrades.
The RAG MCP server is not started in evals; `research-degrades-without-rag` relies on that.

## Evidence so far

The four cases that need only Write/Edit passed at 1.0 locally on Claude Code 2.1.280 (2026-09-23).
`research-degrades-without-rag` also passed at 1.0 on 2.1.331 (2026-11-24) with the baseline arm:
0.33 without the plugin, delta 0.67, USD 0.24 for the two runs.
The two Bash cases (`destructive-command-blocked`, `review-flags-missing-tests`) have never run under
a sandbox backend: locally they are refused without `bubblewrap`/`socat`, and CI, which installs
both, had no API key. They are the cases to watch on the first green CI run.

## Requirements

Granting `Bash` inside the eval sandbox requires a working sandbox backend: `bubblewrap` (`bwrap`) and
`socat`. Without them, `claude plugin eval` refuses to start any run that grants `Bash` at all (it will
not run the case unconfined). Install on Debian/Ubuntu/WSL with:

```
sudo apt-get install -y bubblewrap socat
```

Without `bubblewrap`/`socat`, the two `Bash`-dependent cases — `destructive-command-blocked` and
`review-flags-missing-tests` — cannot run on that host and must be treated as **skipped by
environment**, not failed. The other four cases (`implement-feature-stops-at-gate`,
`research-degrades-without-rag`, `secret-write-blocked`, `tester-cannot-edit-src`) only need
`Write`/`Edit`, which do not require the sandbox backend, and can be run with
`--allow-tools Write Edit` on a host without `bubblewrap`/`socat`.
