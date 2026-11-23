import { McpServer, type Transport } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as z from 'zod';
import { loadConfig } from './config.js';
import { COLLECTIONS } from './contract.js';
import { createDb } from './db.js';
import { DimensionMismatchError, assertDimension, createEmbeddingProvider } from './embeddings.js';
import { describeError, getSourceTool, listSourcesTool, ragStatusTool, searchKnowledge, type ToolDeps } from './tools.js';

/** Single source of truth for the version: rag/package.json, one level up from src/ and dist/ alike. */
const { version: SERVER_VERSION } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

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
      description: 'Semantic search over the engineering knowledge base (cosine, top-k). Default scope: the current project plus _global. When no project is known (no `.ai-engineering/project.yaml` and no `RAG_PROJECT`), the search covers every project. Returns chunks with heading_path, source location, collection, project, source_id, content_hash and score. Read-only.',
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

export interface StartOptions {
  deps: ToolDeps;
  transport: Transport;
  /** Called with 1 on an embedding contract violation. Defaults to process.exit. */
  exit?: (code: number) => void;
  log?: (line: string) => void;
}

/**
 * Connects the transport first, then probes the embedding contract. The probe can take a while
 * (Ollama loads the model on its first /api/embed call), and doing it before connect() kept the
 * MCP handshake waiting until the client gave up on the server.
 */
export async function start({ deps, transport, exit = (code) => process.exit(code), log = (line) => console.error(line) }: StartOptions): Promise<McpServer> {
  const server = buildServer(deps);
  // The client closing stdin is the shutdown signal: release the pool so the process can exit.
  server.server.onclose = () => {
    void deps.sql.end({ timeout: 1 }).catch(() => undefined).finally(() => exit(0));
  };
  await server.connect(transport);
  log(`[engineering-rag] v${SERVER_VERSION} ready (project: ${deps.cfg.defaultProject ?? 'none'}, provider: ${deps.provider.name})`);

  // Fail only on a contract violation. Connectivity problems degrade to tool-level errors.
  try {
    await assertDimension(deps.provider);
  } catch (err) {
    if (err instanceof DimensionMismatchError) {
      log(err.message);
      exit(1);
      return server;
    }
    log(`[engineering-rag] embedding provider unavailable at startup: ${(err as Error).message}`);
  }
  return server;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  await start({ deps: { sql: createDb(cfg.databaseUrl), provider: createEmbeddingProvider(cfg), cfg }, transport: new StdioServerTransport() });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[engineering-rag] fatal: ${(err as Error).message}`);
    process.exit(1);
  });
}
