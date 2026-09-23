import postgres, { type Sql } from 'postgres';
import pgvector from 'pgvector';
import type { Collection } from './contract.js';

export type Db = Sql;

export function createDb(url: string): Db {
  return postgres(url, {
    max: 4,
    connect_timeout: 5,
    onnotice: () => {},
  });
}

export interface SourceInput {
  project: string;
  collection: Collection;
  path?: string;
  url?: string;
  title: string;
  sha256: string;
  metadata?: Record<string, unknown>;
}

export interface SourceRow {
  id: string;
  project: string;
  collection: Collection;
  path: string | null;
  url: string | null;
  title: string | null;
  sha256: string;
  metadata: Record<string, unknown>;
  ingested_at: Date;
}

export interface SourceSummary extends SourceRow {
  chunk_count: number;
}

export interface ChunkInput {
  position: number;
  headingPath: string;
  content: string;
  contentHash: string;
  embedding: number[];
}

export interface StoredChunk {
  position: number;
  heading_path: string;
  content: string;
  content_hash: string;
}

export interface SearchHit extends StoredChunk {
  chunk_id: number;
  source_id: string;
  project: string;
  collection: Collection;
  path: string | null;
  url: string | null;
  title: string | null;
  score: number;
}

export async function findSource(sql: Db, project: string, collection: Collection, origin: string): Promise<SourceRow | undefined> {
  const rows = await sql<SourceRow[]>`
    select * from sources
    where project = ${project} and collection = ${collection} and coalesce(path, url) = ${origin}`;
  return rows[0];
}

/** Inserts or updates the source row, then replaces all of its chunks. One transaction. */
export async function upsertSourceWithChunks(sql: Db, source: SourceInput, chunks: ChunkInput[]): Promise<string> {
  const id = await sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into sources (project, collection, path, url, title, sha256, metadata, ingested_at)
      values (${source.project}, ${source.collection}, ${source.path ?? null}, ${source.url ?? null},
              ${source.title}, ${source.sha256}, ${tx.json((source.metadata ?? {}) as postgres.JSONValue)}, now())
      on conflict (project, collection, (coalesce(path, url)))
      do update set title = excluded.title, sha256 = excluded.sha256, metadata = excluded.metadata, ingested_at = now()
      returning id`;
    await tx`delete from chunks where source_id = ${row.id}`;
    for (const c of chunks) {
      await tx`
        insert into chunks (source_id, position, heading_path, content, content_hash, embedding)
        values (${row.id}, ${c.position}, ${c.headingPath}, ${c.content}, ${c.contentHash}, ${pgvector.toSql(c.embedding)}::vector)`;
    }
    return row.id;
  });
  return id as string;
}

export interface SearchOptions {
  /** Omit to search every project. */
  projects?: string[];
  collections: Collection[];
  limit: number;
}

export async function searchChunks(sql: Db, embedding: number[], opts: SearchOptions): Promise<SearchHit[]> {
  const vec = pgvector.toSql(embedding);
  const allProjects = opts.projects === undefined;
  const projects = opts.projects ?? [];
  return sql<SearchHit[]>`
    select c.id::int as chunk_id, c.source_id, c.position, c.heading_path, c.content, c.content_hash,
           s.project, s.collection, s.path, s.url, s.title,
           1 - (c.embedding <=> ${vec}::vector) as score
    from chunks c
    join sources s on s.id = c.source_id
    where (${allProjects} or s.project = any(${projects}))
      and s.collection = any(${opts.collections})
    order by c.embedding <=> ${vec}::vector
    limit ${opts.limit}`;
}

export async function listSources(sql: Db, filter: { project?: string; collection?: Collection } = {}): Promise<SourceSummary[]> {
  return sql<SourceSummary[]>`
    select s.*, count(c.id)::int as chunk_count
    from sources s
    left join chunks c on c.source_id = s.id
    where (${filter.project === undefined} or s.project = ${filter.project ?? ''})
      and (${filter.collection === undefined} or s.collection = ${filter.collection ?? ''})
    group by s.id
    order by s.project, s.collection, coalesce(s.path, s.url)`;
}

export async function getSourceWithChunks(sql: Db, id: string): Promise<{ source: SourceRow; chunks: StoredChunk[] } | undefined> {
  const [source] = await sql<SourceRow[]>`select * from sources where id = ${id}`;
  if (!source) return undefined;
  const chunks = await sql<StoredChunk[]>`
    select position, heading_path, content, content_hash from chunks where source_id = ${id} order by position`;
  return { source, chunks };
}

/** Deletes path-based sources under `pathPrefix` whose path is not in `keepOrigins`. Returns deleted paths. */
export async function pruneSources(sql: Db, project: string, collection: Collection, pathPrefix: string, keepOrigins: string[]): Promise<string[]> {
  const rows = await sql<{ path: string }[]>`
    delete from sources
    where project = ${project} and collection = ${collection}
      and path is not null and path like ${pathPrefix + '%'}
      and path <> all(${keepOrigins})
    returning path`;
  return rows.map((r) => r.path).sort();
}

export async function countChunks(sql: Db): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from chunks`;
  return row.n;
}
