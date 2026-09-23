import { describe, expect, it } from 'vitest';
import { formatStatus } from '../src/doctor.js';
import { collectStatus } from '../src/status.js';
import { FakeEmbeddings } from '../src/embeddings.js';
import { createDb } from '../src/db.js';

describe('formatStatus', () => {
  it('prints one line per check and a verdict', () => {
    const text = formatStatus({ ok: false, checks: [{ name: 'node', ok: true, detail: 'v22.1.0' }, { name: 'postgres', ok: false, detail: 'ECONNREFUSED' }] });
    expect(text).toContain('✓ node: v22.1.0');
    expect(text).toContain('✗ postgres: ECONNREFUSED');
    expect(text.trim().endsWith('RAG is not ready.')).toBe(true);
    expect(formatStatus({ ok: true, checks: [] }).trim().endsWith('RAG is ready.')).toBe(true);
  });
});

describe('collectStatus without infrastructure', () => {
  it('reports failures instead of throwing, and passes the checks that need no services', async () => {
    const sql = createDb('postgres://nobody:x@127.0.0.1:1/none');
    const status = await collectStatus(
      { databaseUrl: 'postgres://nobody:x@127.0.0.1:1/none', ollamaUrl: 'http://127.0.0.1:1', embedModel: 'bge-m3', embedProvider: 'fake', defaultProject: undefined },
      { sql, provider: new FakeEmbeddings(), fetchImpl: (async () => { throw new Error('fetch failed'); }) as unknown as typeof fetch, distPath: '/definitely/missing/server.js' },
    );
    await sql.end();
    const byName = Object.fromEntries(status.checks.map((c) => [c.name, c]));
    expect(status.ok).toBe(false);
    expect(byName.node.ok).toBe(true);
    expect(byName.postgres.ok).toBe(false);
    expect(byName['embedding dimension'].ok).toBe(true);   // fake provider honours the contract
    expect(byName['embedding provider'].detail).toContain('fake');
    expect(byName['mcp build'].ok).toBe(false);
  });
});
