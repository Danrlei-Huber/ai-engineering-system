import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { FakeEmbeddings } from '../src/embeddings.js';
import { upsertSourceWithChunks } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildServer } from '../src/server.js';
import { INTEGRATION, integrationDb, resetSchema } from './helpers/db.js';

describe.skipIf(!INTEGRATION)('MCP server (integration)', () => {
  const sql = integrationDb();
  const fake = new FakeEmbeddings();
  const cfg = { databaseUrl: process.env.RAG_TEST_DATABASE_URL ?? 'postgres://rag:rag_local_only@localhost:5433/rag', ollamaUrl: 'http://127.0.0.1:1', embedModel: 'bge-m3', embedProvider: 'fake' as const, defaultProject: 'p1' };
  let client: Client;
  let sourceId: string;

  beforeAll(async () => {
    await resetSchema(sql); await migrate(sql);
    const [e1] = await fake.embed(['PG\n\npostgres migrations must be reversible']);
    const [e2] = await fake.embed(['Testing\n\nevery feature ships with tests']);
    sourceId = await upsertSourceWithChunks(sql, { project: 'p1', collection: 'decisions', path: 'docs/decisions/ADR-001.md', title: 'ADR-001', sha256: 'a' }, [{ position: 0, headingPath: 'PG', content: 'postgres migrations must be reversible', contentHash: 'h1', embedding: e1 }]);
    await upsertSourceWithChunks(sql, { project: '_global', collection: 'standards', path: 'skills/rules/testing/SKILL.md', title: 'Testing', sha256: 'b' }, [{ position: 0, headingPath: 'Testing', content: 'every feature ships with tests', contentHash: 'h2', embedding: e2 }]);
    const server = buildServer({ sql, provider: fake, cfg });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    client = new Client({ name: 't', version: '0' });
    await client.connect(ct);
  });
  afterAll(async () => { await client.close(); await sql.end(); });

  const text = (res: Awaited<ReturnType<Client['callTool']>>) => (res.content as { type: string; text: string }[])[0].text;

  it('search_knowledge defaults to the current project plus _global and returns hits with scores', async () => {
    const hits = JSON.parse(text(await client.callTool({ name: 'search_knowledge', arguments: { query: 'reversible migrations' } }))) as { project: string; source_id: string; score: number; heading_path: string }[];
    expect(hits[0]).toMatchObject({ project: 'p1', source_id: sourceId, heading_path: 'PG' });
    expect(hits.map((h) => h.project).sort()).toEqual(['_global', 'p1']);
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('filters by collections', async () => {
    const hits = JSON.parse(text(await client.callTool({ name: 'search_knowledge', arguments: { query: 'tests', collections: ['standards'] } }))) as { collection: string }[];
    expect(hits.map((h) => h.collection)).toEqual(['standards']);
  });

  it('list_sources and get_source work', async () => {
    const list = JSON.parse(text(await client.callTool({ name: 'list_sources', arguments: { project: 'p1' } }))) as { id: string; chunk_count: number }[];
    expect(list).toHaveLength(1);
    expect(list[0].chunk_count).toBe(1);
    const full = JSON.parse(text(await client.callTool({ name: 'get_source', arguments: { source_id: sourceId } }))) as { source: { title: string }; chunks: unknown[]; document: string };
    expect(full.source.title).toBe('ADR-001');
    expect(full.chunks).toHaveLength(1);
    expect(full.document).toContain('postgres migrations must be reversible');
    const missing = await client.callTool({ name: 'get_source', arguments: { source_id: '00000000-0000-0000-0000-000000000000' } });
    expect(missing.isError).toBe(true);
  });

  it('rag_status reports ok for the checks that have infrastructure', async () => {
    const status = JSON.parse(text(await client.callTool({ name: 'rag_status', arguments: {} }))) as { checks: { name: string; ok: boolean }[] };
    const ok = Object.fromEntries(status.checks.map((c) => [c.name, c.ok]));
    expect(ok.postgres).toBe(true);
    expect(ok.pgvector).toBe(true);
    expect(ok.migrations).toBe(true);
  });
});
