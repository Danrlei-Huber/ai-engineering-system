import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appliedMigrations, downFileFor, listMigrationFiles, migrate, pendingMigrations, rollback } from '../src/migrate.js';
import type { Db } from '../src/db.js';
import { INTEGRATION, integrationDb, resetSchema } from './helpers/db.js';

describe.skipIf(!INTEGRATION)('migrate (integration)', () => {
  let sql: Db;
  beforeAll(async () => { sql = await integrationDb(); await resetSchema(sql); });
  afterAll(async () => { await sql.end(); });

  it('lists 001_init.sql and not its down file', () => {
    expect(listMigrationFiles()).toEqual(['001_init.sql']);
    expect(downFileFor('001_init.sql')).toBe('001_init.down.sql');
  });

  it('applies pending migrations once and records them', async () => {
    expect(await pendingMigrations(sql)).toEqual(['001_init.sql']);
    expect(await migrate(sql)).toEqual(['001_init.sql']);
    expect(await appliedMigrations(sql)).toEqual(['001_init.sql']);
    expect(await migrate(sql)).toEqual([]);
  });

  it('creates the vector(1024) column and the HNSW cosine index', async () => {
    const [col] = await sql<{ atttypmod: number }[]>`
      select a.atttypmod from pg_attribute a join pg_class c on c.oid = a.attrelid
      where c.relname = 'chunks' and a.attname = 'embedding'`;
    expect(col.atttypmod).toBe(1024);
    const [idx] = await sql<{ indexdef: string }[]>`select indexdef from pg_indexes where indexname = 'chunks_embedding_idx'`;
    expect(idx.indexdef).toMatch(/USING hnsw \(embedding vector_cosine_ops\)/);
  });

  it('rollback reverts the last applied migration with its .down.sql and migrate re-applies it', async () => {
    expect(await rollback(sql)).toBe('001_init.sql');
    expect(await appliedMigrations(sql)).toEqual([]);
    const [reg] = await sql<{ t: string | null }[]>`select to_regclass('chunks') as t`;
    expect(reg.t).toBeNull();
    expect(await rollback(sql)).toBeUndefined();
    expect(await migrate(sql)).toEqual(['001_init.sql']);
  });
});
