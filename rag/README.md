# engineering-rag

Read-only knowledge base for the ai-engineering-system plugin. PostgreSQL + pgvector, embeddings from Ollama `bge-m3` (1024 dims, cosine).

## Bring up

```bash
cp -n .env.example .env          # dev credentials only
docker compose up -d             # postgres + ollama, then ollama-pull downloads bge-m3 (~1.2 GB)
npm ci && npm run build          # the plugin's .mcp.json runs dist/server.js
npm run migrate
npm run doctor                   # must end with "RAG is ready."
npm run ingest:standards         # plugin rules + ADRs into _global/standards
```

## Operate

- `npm run ingest -- --project <p> --collection <docs|decisions|standards|external> [--prune] <path...>` (paths stored relative to the cwd; use `--root` to change it)
- `npm run ingest -- --project <p> --collection external --url <u> --title <t> <file.md>`
- `npm run doctor` for a full checklist; the `rag_status` MCP tool gives the same data to agents.
- Data lives in the Docker volumes `engineering_rag_pgdata` and `engineering_rag_ollama`.

## Develop

- `npm test` runs unit tests. `RAG_RUN_INTEGRATION=1 RAG_EMBED_PROVIDER=fake npm test` also runs the integration suites; `npm run test:integration` is the shortcut for that (still needs `RAG_EMBED_PROVIDER=fake` set).
- Integration tests use the `rag_test` database on the compose Postgres (5433) by default and create it if it is missing — they drop and recreate their tables, so they never touch the dev database `rag`. Set `RAG_TEST_DATABASE_URL` to override (CI points it at its own throwaway `rag` service container).
- `RAG_EMBED_PROVIDER=fake` exported in your shell also applies to the live MCP server: it will then index and search with deterministic fake vectors instead of Ollama (`rag_status` reports `fake (tests/CI only)`). Unset it for real work.
- The embedding contract is in `src/contract.ts` and `migrations/001_init.sql`; changing it is ADR-006 territory.
