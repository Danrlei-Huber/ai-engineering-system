# Plugin evals

Run all: `claude plugin eval . --scaffold --trust-plugin --ablation none --threshold 0.8 --allow-tools Bash Write Edit`
Run one: `claude plugin eval evals/<case>/case.yaml --scaffold --trust-plugin --ablation none --allow-tools Bash Write Edit`
Tags: `workflow` (pipeline behaviour), `security` (hook enforcement).

Plugin hooks run inside `claude plugin eval` only when `--trust-plugin` is passed; without it the security cases fail. The `agent_type` hook-input field was verified on Claude Code 2.1.280 and must be re-verified on CLI upgrades.
The RAG MCP server is not started in evals; `research-degrades-without-rag` relies on that.

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
