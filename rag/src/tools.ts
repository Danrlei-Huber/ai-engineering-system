import type { RagConfig } from './config.js';
import { COLLECTIONS, GLOBAL_PROJECT, type Collection } from './contract.js';
import { getSourceWithChunks, listSources, searchChunks, type Db, type SearchHit, type SourceSummary, type StoredChunk } from './db.js';
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

/**
 * Rebuilds readable markdown from ordered chunks: each heading appears once, at the depth of its
 * path ("Doc > Setup" is an H2 "Setup"), so a section split into several chunks is not re-titled.
 */
export function rebuildDocument(chunks: StoredChunk[]): string {
  const parts: string[] = [];
  let previous: string | undefined;
  for (const chunk of chunks) {
    if (chunk.heading_path && chunk.heading_path !== previous) {
      const segments = chunk.heading_path.split(' > ');
      parts.push(`${'#'.repeat(Math.min(segments.length, 6))} ${segments[segments.length - 1]}`);
    }
    previous = chunk.heading_path;
    parts.push(chunk.content);
  }
  return parts.join('\n\n');
}

export async function getSourceTool(deps: ToolDeps, args: { source_id: string }) {
  const found = await getSourceWithChunks(deps.sql, args.source_id);
  if (!found) throw new SourceNotFoundError(args.source_id);
  return { ...found, document: rebuildDocument(found.chunks) };
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
