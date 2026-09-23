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

describe('collectStatus migrations check', () => {
  const recordingSql = (queries: string[], regclass: string | null) =>
    ((strings: TemplateStringsArray) => {
      const q = strings.join('?');
      queries.push(q);
      if (q.includes('to_regclass')) return Promise.resolve([{ t: regclass }]);
      if (q.includes('from schema_migrations')) return Promise.resolve([{ name: '001_init.sql' }]);
      if (q.includes('pg_extension')) return Promise.resolve([{ extversion: '0.8.0' }]);
      if (q.includes('count(*)')) return Promise.resolve([{ n: 0 }]);
      return Promise.resolve([]);
    }) as unknown as ReturnType<typeof createDb>;

  const cfg = { databaseUrl: 'postgres://u:p@h/db', ollamaUrl: 'http://127.0.0.1:1', embedModel: 'bge-m3', embedProvider: 'fake' as const, defaultProject: undefined };

  it('reads schema_migrations without running any DDL', async () => {
    const queries: string[] = [];
    const status = await collectStatus(cfg, { sql: recordingSql(queries, 'schema_migrations'), distPath: '/definitely/missing/server.js' });
    const migrations = status.checks.find((c) => c.name === 'migrations')!;
    expect(migrations.ok).toBe(true);
    expect(migrations.detail).toBe('up to date');
    expect(queries.some((q) => /create\s+table/i.test(q))).toBe(false);
  });

  it('reports "not migrated" instead of creating the table when schema_migrations is absent', async () => {
    const queries: string[] = [];
    const status = await collectStatus(cfg, { sql: recordingSql(queries, null), distPath: '/definitely/missing/server.js' });
    const migrations = status.checks.find((c) => c.name === 'migrations')!;
    expect(migrations.ok).toBe(false);
    expect(migrations.detail).toMatch(/not migrated; run npm run migrate/);
    expect(queries.some((q) => /create\s+table/i.test(q))).toBe(false);
    expect(queries.some((q) => q.includes('from schema_migrations'))).toBe(false);
  });
});
