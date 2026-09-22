# Plugin evals

Run all: `claude plugin eval . --scaffold --trust-plugin --ablation none --threshold 0.8`
Run one: `claude plugin eval evals/<case>/case.yaml --scaffold --trust-plugin --ablation none`
Tags: `workflow` (pipeline behaviour), `security` (hook enforcement).

Hooks run outside the sandbox, so `security` results are advisory unless run in CI.
The RAG MCP server is not started in evals; `research-degrades-without-rag` relies on that.
