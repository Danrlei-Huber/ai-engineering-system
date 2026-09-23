import type { RagConfig } from './config.js';
import { COLLECTIONS, GLOBAL_PROJECT, type Collection } from './contract.js';
import { getSourceWithChunks, listSources, searchChunks, type Db, type SearchHit, type SourceSummary } from './db.js';
import type { EmbeddingProvider } from './embeddings.js';
import { collectStatus, type RagStatus } from './status.js';

export interface ToolDeps {
  sql: Db;
  provider: EmbeddingProvider;
  cfg: RagConfig;
}

export interface SearchArgs {
  query: string;
  project?: string;
  collections?: Collection[];
  limit?: number;
}

/** Default scope: the named (or configured) project plus _global. No project known: every project. */
export async function searchKnowledge(deps: ToolDeps, args: SearchArgs): Promise<SearchHit[]> {
  const project = args.project ?? deps.cfg.defaultProject;
  const projects = project ? [project, GLOBAL_PROJECT] : undefined;
  const [embedding] = await deps.provider.embed([args.query]);
  return searchChunks(deps.sql, embedding, {
    projects,
    collections: args.collections?.length ? args.collections : [...COLLECTIONS],
    limit: args.limit ?? 8,
  });
}

export async function listSourcesTool(deps: ToolDeps, args: { project?: string; collection?: Collection }): Promise<SourceSummary[]> {
  return listSources(deps.sql, args);
}

export class SourceNotFoundError extends Error {
  constructor(id: string) {
    super(`source ${id} not found`);
    this.name = 'SourceNotFoundError';
  }
}

export async function getSourceTool(deps: ToolDeps, args: { source_id: string }) {
  const found = await getSourceWithChunks(deps.sql, args.source_id);
  if (!found) throw new SourceNotFoundError(args.source_id);
  const document = found.chunks.map((c) => (c.heading_path ? `## ${c.heading_path}\n\n${c.content}` : c.content)).join('\n\n');
  return { ...found, document };
}

export async function ragStatusTool(deps: ToolDeps): Promise<RagStatus> {
  return collectStatus(deps.cfg, { sql: deps.sql, provider: deps.provider });
}

const BRING_UP = 'Start it with: cd <plugin>/rag && docker compose up -d && npm run migrate';

export function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof SourceNotFoundError) return msg;
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|CONNECT_TIMEOUT|connection|Connection terminated|password authentication/i.test(msg) && !/11434|ollama/i.test(msg)) {
    return `RAG database unreachable (${msg}). ${BRING_UP}`;
  }
  if (/11434|ollama|fetch failed/i.test(msg)) {
    return `Ollama unreachable or model missing (${msg}). Start it with: cd <plugin>/rag && docker compose up -d ollama ollama-pull`;
  }
  return `RAG error: ${msg}. Run 'npm run doctor' in the rag/ directory for a full check.`;
}
