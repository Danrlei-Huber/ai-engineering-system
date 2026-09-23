import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createDb } from '../src/db.js';
import { FakeEmbeddings } from '../src/embeddings.js';
import { buildServer } from '../src/server.js';
import { describeError } from '../src/tools.js';

const cfg = { databaseUrl: 'postgres://nobody:x@127.0.0.1:1/none', ollamaUrl: 'http://127.0.0.1:1', embedModel: 'bge-m3', embedProvider: 'fake' as const, defaultProject: 'demo' };

async function connected() {
  const sql = createDb(cfg.databaseUrl);
  const server = buildServer({ sql, provider: new FakeEmbeddings(), cfg });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  return { client, sql, close: async () => { await client.close(); await sql.end({ timeout: 1 }); } };
}

describe('MCP server without a database', () => {
  it('exposes exactly the four read-only tools', async () => {
    const { client, close } = await connected();
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(['get_source', 'list_sources', 'rag_status', 'search_knowledge']);
    await close();
  });

  it('answers search_knowledge with an actionable error instead of crashing', async () => {
    const { client, close } = await connected();
    const res = await client.callTool({ name: 'search_knowledge', arguments: { query: 'anything' } });
    expect(res.isError).toBe(true);
    const text = (res.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/RAG database unreachable/);
    expect(text).toMatch(/docker compose up -d/);
    await close();
  });

  it('rag_status still answers and reports postgres down', async () => {
    const { client, close } = await connected();
    const res = await client.callTool({ name: 'rag_status', arguments: {} });
    expect(res.isError).toBeFalsy();
    const status = JSON.parse((res.content as { type: string; text: string }[])[0].text) as { ok: boolean; checks: { name: string; ok: boolean }[] };
    expect(status.ok).toBe(false);
    expect(status.checks.find((c) => c.name === 'postgres')?.ok).toBe(false);
    await close();
  });
});

describe('describeError', () => {
  it('maps connection failures to bring-up instructions', () => {
    expect(describeError(new Error('connect ECONNREFUSED 127.0.0.1:5433'))).toMatch(/RAG database unreachable/);
    expect(describeError(new Error('fetch failed: http://localhost:11434/api/embed'))).toMatch(/Ollama unreachable/);
    expect(describeError(new Error('weird'))).toMatch(/RAG error: weird.*npm run doctor/);
  });
});
