import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createDb } from '../src/db.js';
import { FakeEmbeddings, type EmbeddingProvider } from '../src/embeddings.js';
import { start } from '../src/server.js';

const cfg = { databaseUrl: 'postgres://nobody:x@127.0.0.1:1/none', ollamaUrl: 'http://127.0.0.1:1', embedModel: 'bge-m3', embedProvider: 'fake' as const, defaultProject: 'demo' };

/** A provider whose first embed call (the startup probe) hangs until `release()` is called. */
function slowProvider(dims = 1024): { provider: EmbeddingProvider; release: () => void; calls: number } {
  const inner = new FakeEmbeddings(dims);
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const state = { calls: 0, release, provider: undefined as unknown as EmbeddingProvider };
  state.provider = {
    name: 'slow',
    async embed(texts: string[]) {
      state.calls += 1;
      await gate;
      return inner.embed(texts);
    },
  };
  return state;
}

describe('start', () => {
  it('serves the MCP handshake before the embedding probe has answered', async () => {
    const sql = createDb(cfg.databaseUrl);
    const slow = slowProvider();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const exits: number[] = [];
    const started = start({ deps: { sql, provider: slow.provider, cfg }, transport: st, exit: (code) => { exits.push(code); }, log: () => {} });

    const client = new Client({ name: 't', version: '0' });
    await client.connect(ct);                       // would hang forever if the probe ran before connect()
    expect((await client.listTools()).tools.map((t) => t.name)).toContain('rag_status');
    expect(slow.calls).toBe(1);                     // probe is in flight, not skipped

    slow.release();
    await started;
    expect(exits).toEqual([]);
    await client.close();
    await sql.end({ timeout: 1 });
  });

  it('still exits with code 1 on an embedding dimension mismatch', async () => {
    const sql = createDb(cfg.databaseUrl);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const exits: number[] = [];
    const logs: string[] = [];
    await start({ deps: { sql, provider: new FakeEmbeddings(768), cfg }, transport: st, exit: (code) => { exits.push(code); }, log: (m) => logs.push(m) });
    expect(exits).toEqual([1]);
    expect(logs.join('\n')).toMatch(/returned 768 dimensions, expected 1024/);
    const client = new Client({ name: 't', version: '0' });
    await client.connect(ct);
    await client.close();
    await sql.end({ timeout: 1 });
  });

  it('keeps serving when the provider is merely unavailable at startup', async () => {
    const sql = createDb(cfg.databaseUrl);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const exits: number[] = [];
    const logs: string[] = [];
    const down: EmbeddingProvider = { name: 'down', embed: async () => { throw new Error('fetch failed'); } };
    await start({ deps: { sql, provider: down, cfg }, transport: st, exit: (code) => { exits.push(code); }, log: (m) => logs.push(m) });
    expect(exits).toEqual([]);
    expect(logs.join('\n')).toMatch(/embedding provider unavailable at startup: fetch failed/);
    const client = new Client({ name: 't', version: '0' });
    await client.connect(ct);
    await client.close();
    await sql.end({ timeout: 1 });
  });
});
