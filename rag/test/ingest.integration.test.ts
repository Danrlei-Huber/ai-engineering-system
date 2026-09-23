import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeEmbeddings } from '../src/embeddings.js';
import { ingest } from '../src/ingest.js';
import { listSources, getSourceWithChunks, countChunks } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { INTEGRATION, integrationDb, resetSchema } from './helpers/db.js';

describe.skipIf(!INTEGRATION)('ingest (integration)', () => {
  const sql = integrationDb();
  const fake = new FakeEmbeddings();
  let root: string;

  beforeAll(async () => { await resetSchema(sql); await migrate(sql); });
  beforeEach(async () => {
    await sql`delete from sources`;
    root = mkdtempSync(join(tmpdir(), 'rag-ing-'));
    mkdirSync(join(root, 'docs', 'decisions'), { recursive: true });
    writeFileSync(join(root, 'docs', 'decisions', 'ADR-001.md'), '# ADR-001: Use Postgres\n\n## Decision\n\nUse Postgres.\n');
    writeFileSync(join(root, 'docs', 'decisions', 'ADR-002.md'), '# ADR-002: Events\n\n## Decision\n\nEvents.\n');
  });
  afterAll(async () => { await sql.end(); });

  const base = () => ({ project: 'p1', collection: 'decisions' as const, targets: ['docs/decisions'], root });

  it('ingests new files, skips unchanged ones and re-ingests changed ones', async () => {
    const first = await ingest(sql, fake, base());
    expect(first.ingested.sort()).toEqual(['docs/decisions/ADR-001.md', 'docs/decisions/ADR-002.md']);
    expect(first.skipped).toEqual([]);

    const second = await ingest(sql, fake, base());
    expect(second.ingested).toEqual([]);
    expect(second.skipped).toHaveLength(2);

    writeFileSync(join(root, 'docs', 'decisions', 'ADR-001.md'), '# ADR-001: Use Postgres\n\n## Decision\n\nUse Postgres 17.\n\n## Consequences\n\nMore.\n');
    const third = await ingest(sql, fake, base());
    expect(third.ingested).toEqual(['docs/decisions/ADR-001.md']);
    const adr1 = (await listSources(sql, { project: 'p1' })).find((s) => s.path === 'docs/decisions/ADR-001.md')!;
    expect(adr1.title).toBe('ADR-001: Use Postgres');
    expect(adr1.chunk_count).toBe(2);
    expect((await getSourceWithChunks(sql, adr1.id))!.chunks[0].heading_path).toBe('ADR-001: Use Postgres > Decision');
  });

  it('prunes vanished files only with prune: true', async () => {
    await ingest(sql, fake, base());
    rmSync(join(root, 'docs', 'decisions', 'ADR-002.md'));
    expect((await ingest(sql, fake, base())).pruned).toEqual([]);
    expect((await listSources(sql, { project: 'p1' })).length).toBe(2);
    expect((await ingest(sql, fake, { ...base(), prune: true })).pruned).toEqual(['docs/decisions/ADR-002.md']);
    expect((await listSources(sql, { project: 'p1' })).length).toBe(1);
  });

  it('stores external sources by url with retrieved_at metadata', async () => {
    writeFileSync(join(root, 'scrapy.md'), '# Scrapy notes\n\nUse Scrapy 2.x.\n');
    const r = await ingest(sql, fake, { project: 'p1', collection: 'external', targets: ['scrapy.md'], root, url: 'https://docs.scrapy.org/', title: 'Scrapy docs' });
    expect(r.ingested).toEqual(['scrapy.md']);
    const [src] = await listSources(sql, { project: 'p1', collection: 'external' });
    expect(src).toMatchObject({ url: 'https://docs.scrapy.org/', path: null, title: 'Scrapy docs' });
    expect(typeof src.metadata.retrieved_at).toBe('string');
    expect(await countChunks(sql)).toBe(1);
  });
});
