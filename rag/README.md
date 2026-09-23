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

- `npm test` runs unit tests. `RAG_RUN_INTEGRATION=1 RAG_EMBED_PROVIDER=fake npm test` also runs the integration suites against `RAG_TEST_DATABASE_URL` (default: the compose Postgres on 5433).
- The embedding contract is in `src/contract.ts` and `migrations/001_init.sql`; changing it is ADR-006 territory.
