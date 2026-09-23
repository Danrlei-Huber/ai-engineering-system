import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeEmbeddings } from '../src/embeddings.js';
import { migrate } from '../src/migrate.js';
import { countChunks, findSource, getSourceWithChunks, listSources, pruneSources, searchChunks, upsertSourceWithChunks } from '../src/db.js';
import { INTEGRATION, integrationDb, resetSchema } from './helpers/db.js';

describe.skipIf(!INTEGRATION)('db repository (integration)', () => {
  const sql = integrationDb();
  const fake = new FakeEmbeddings();

  async function chunk(position: number, headingPath: string, content: string) {
    const [embedding] = await fake.embed([`${headingPath}\n\n${content}`]);
    return { position, headingPath, content, contentHash: `h${position}-${content.length}`, embedding };
  }

  beforeAll(async () => { await resetSchema(sql); await migrate(sql); });
  beforeEach(async () => { await sql`delete from sources`; });
  afterAll(async () => { await sql.end(); });

  it('upserts a source, replaces its chunks and finds it by origin', async () => {
    const id = await upsertSourceWithChunks(sql, { project: 'p1', collection: 'docs', path: 'docs/a.md', title: 'A', sha256: 's1' }, [await chunk(0, 'A', 'first')]);
    const again = await upsertSourceWithChunks(sql, { project: 'p1', collection: 'docs', path: 'docs/a.md', title: 'A2', sha256: 's2' }, [await chunk(0, 'A', 'second'), await chunk(1, 'A > B', 'third')]);
    expect(again).toBe(id);
    const found = await findSource(sql, 'p1', 'docs', 'docs/a.md');
    expect(found?.sha256).toBe('s2');
    expect(found?.title).toBe('A2');
    expect(await countChunks(sql)).toBe(2);
  });

  it('searches by cosine within project + _global scope and returns scores', async () => {
    await upsertSourceWithChunks(sql, { project: 'p1', collection: 'docs', path: 'docs/pg.md', title: 'PG', sha256: 'a' }, [await chunk(0, 'PG', 'postgres migrations must be reversible')]);
    await upsertSourceWithChunks(sql, { project: '_global', collection: 'standards', path: 'skills/rules/testing/SKILL.md', title: 'Testing', sha256: 'b' }, [await chunk(0, 'Testing', 'every feature ships with tests')]);
    await upsertSourceWithChunks(sql, { project: 'p2', collection: 'docs', path: 'docs/pg.md', title: 'PG2', sha256: 'c' }, [await chunk(0, 'PG', 'postgres migrations must be reversible')]);

    const [q] = await fake.embed(['reversible postgres migration']);
    const hits = await searchChunks(sql, q, { projects: ['p1', '_global'], collections: ['docs', 'decisions', 'standards', 'external'], limit: 8 });
    expect(hits.map((h) => h.project)).not.toContain('p2');
    expect(hits[0].project).toBe('p1');
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(hits[0]).toMatchObject({ collection: 'docs', path: 'docs/pg.md', title: 'PG', heading_path: 'PG' });
    expect(typeof hits[0].chunk_id).toBe('number');
  });

  it('searches every project when projects is omitted and filters by collection', async () => {
    await upsertSourceWithChunks(sql, { project: 'p1', collection: 'docs', path: 'x.md', title: 'x', sha256: 'a' }, [await chunk(0, '', 'alpha')]);
    await upsertSourceWithChunks(sql, { project: 'p2', collection: 'decisions', path: 'y.md', title: 'y', sha256: 'b' }, [await chunk(0, '', 'alpha')]);
    const [q] = await fake.embed(['alpha']);
    expect((await searchChunks(sql, q, { collections: ['docs', 'decisions'], limit: 8 })).map((h) => h.project).sort()).toEqual(['p1', 'p2']);
    expect((await searchChunks(sql, q, { collections: ['decisions'], limit: 8 })).map((h) => h.project)).toEqual(['p2']);
  });

  it('lists sources with chunk counts and rebuilds a source from its chunks', async () => {
    const id = await upsertSourceWithChunks(sql, { project: 'p1', collection: 'decisions', path: 'docs/decisions/ADR-001.md', title: 'ADR-001', sha256: 'a' }, [await chunk(0, 'ADR-001', 'context'), await chunk(1, 'ADR-001 > Decision', 'decision')]);
    const list = await listSources(sql, { project: 'p1' });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, collection: 'decisions', chunk_count: 2 });
    const full = await getSourceWithChunks(sql, id);
    expect(full?.chunks.map((c) => c.position)).toEqual([0, 1]);
    expect(full?.chunks[1]).toMatchObject({ heading_path: 'ADR-001 > Decision', content: 'decision' });
    expect(await getSourceWithChunks(sql, '00000000-0000-0000-0000-000000000000')).toBeUndefined();
  });

  it('prunes sources under a path prefix that are not in the keep list', async () => {
    for (const p of ['docs/a.md', 'docs/b.md', 'other/c.md']) {
      await upsertSourceWithChunks(sql, { project: 'p1', collection: 'docs', path: p, title: p, sha256: 'a' }, [await chunk(0, '', p)]);
    }
    const deleted = await pruneSources(sql, 'p1', 'docs', 'docs/', ['docs/a.md']);
    expect(deleted).toEqual(['docs/b.md']);
    expect((await listSources(sql, { project: 'p1' })).map((s) => s.path).sort()).toEqual(['docs/a.md', 'other/c.md']);
  });
});
