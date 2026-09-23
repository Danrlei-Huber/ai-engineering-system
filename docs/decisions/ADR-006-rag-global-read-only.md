# ADR-006: The RAG is global, read-only for agents, with a fixed embedding contract

Status: Accepted (2026-09-22)

## Context
Agents need architecture decisions, standards and project docs at hand without re-reading whole repositories. Letting agents write to shared memory creates a feedback loop where one agent's belief becomes another's "established decision". Embedding models with different dimensions cannot share an index.

## Decision
One PostgreSQL + pgvector database, run from `rag/docker-compose.yml`, partitioned by `project` (scope, `_global` for plugin content) and `collection` (`docs | decisions | standards | external`). The MCP server `engineering-rag` exposes only read tools (`search_knowledge`, `list_sources`, `get_source`, `rag_status`). Ingestion happens only through the CLI (`/ingest-knowledge` wraps it) and is incremental by sha256, pruning only with `--prune`. Only `research` and `architect` hold the RAG tools. Embedding contract for v0.1: Ollama `bge-m3`, 1024 dimensions, cosine distance; the server refuses to start on a dimension mismatch, but keeps running when Postgres or Ollama are merely unreachable.

## Consequences
Knowledge has a human-controlled origin. Changing the embedding model means a new migration and a full re-ingest, and is itself an ADR. Hybrid search, reranking and source-code ingestion are deferred until evals show a need. The RAG is a degradable dependency: research degrades to codebase-only and says so (`rag_available: false`).
