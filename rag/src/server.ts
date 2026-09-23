import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { pathToFileURL } from 'node:url';
import * as z from 'zod';
import { loadConfig } from './config.js';
import { COLLECTIONS } from './contract.js';
import { createDb } from './db.js';
import { DimensionMismatchError, assertDimension, createEmbeddingProvider } from './embeddings.js';
import { describeError, getSourceTool, listSourcesTool, ragStatusTool, searchKnowledge, type ToolDeps } from './tools.js';

const SERVER_VERSION = '0.1.0';

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(err: unknown) {
  return { isError: true, content: [{ type: 'text' as const, text: describeError(err) }] };
}

export function buildServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: 'engineering-rag', version: SERVER_VERSION });

  server.registerTool(
    'search_knowledge',
    {
      description: 'Semantic search over the engineering knowledge base (cosine, top-k). Default scope: the current project plus _global. Returns chunks with heading_path, source location, collection, project, source_id, content_hash and score. Read-only.',
      inputSchema: z.object({
        query: z.string().min(1),
        project: z.string().min(1).optional(),
        collections: z.array(z.enum(COLLECTIONS)).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async (args) => { try { return ok(await searchKnowledge(deps, args)); } catch (e) { return fail(e); } },
  );

  server.registerTool(
    'list_sources',
    {
      description: 'List indexed sources (documents) with chunk counts, optionally filtered by project and collection. Read-only.',
      inputSchema: z.object({ project: z.string().min(1).optional(), collection: z.enum(COLLECTIONS).optional() }),
    },
    async (args) => { try { return ok(await listSourcesTool(deps, args)); } catch (e) { return fail(e); } },
  );

  server.registerTool(
    'get_source',
    {
      description: 'Return one source with all its chunks in order and the rebuilt document text. Use after search_knowledge when a chunk needs its full context before citing it. Read-only.',
      inputSchema: z.object({ source_id: z.string().uuid() }),
    },
    async (args) => { try { return ok(await getSourceTool(deps, args)); } catch (e) { return fail(e); } },
  );

  server.registerTool(
    'rag_status',
    {
      description: 'Health of the knowledge base: Postgres, pgvector, migrations, chunk count, Ollama, model, embedding dimension, build. Call this first when other tools fail.',
      inputSchema: z.object({}),
    },
    async () => { try { return ok(await ragStatusTool(deps)); } catch (e) { return fail(e); } },
  );

  return server;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const sql = createDb(cfg.databaseUrl);
  const provider = createEmbeddingProvider(cfg);

  // Fail fast only on a contract violation. Connectivity problems degrade to tool-level errors.
  try {
    await assertDimension(provider);
  } catch (err) {
    if (err instanceof DimensionMismatchError) {
      console.error(err.message);
      process.exit(1);
    }
    console.error(`[engineering-rag] embedding provider unavailable at startup: ${(err as Error).message}`);
  }

  const server = buildServer({ sql, provider, cfg });
  await server.connect(new StdioServerTransport());
  console.error(`[engineering-rag] v${SERVER_VERSION} ready (project: ${cfg.defaultProject ?? 'none'}, provider: ${provider.name})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[engineering-rag] fatal: ${(err as Error).message}`);
    process.exit(1);
  });
}
