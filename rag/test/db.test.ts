import { describe, expect, it } from 'vitest';
import { upsertSourceWithChunks, type Db } from '../src/db.js';

/** A transaction double: records every tagged-template statement, answers the bulk-insert helper form with a fragment. */
function recordingDb(log: string[]): Db {
  const tx = (first: unknown, ...rest: unknown[]) => {
    if (Array.isArray(first) && 'raw' in (first as object)) {
      log.push((first as TemplateStringsArray).join('?'));
      return Promise.resolve([{ id: 'src-1' }]);
    }
    return { rows: first, columns: rest };
  };
  (tx as unknown as { json: (v: unknown) => unknown }).json = (v) => v;
  return { begin: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) } as unknown as Db;
}

describe('upsertSourceWithChunks', () => {
  it('inserts chunks in batches of 100 rows, not one statement per chunk', async () => {
    const log: string[] = [];
    const chunks = Array.from({ length: 250 }, (_, i) => ({ position: i, headingPath: 'H', content: `c${i}`, contentHash: `h${i}`, embedding: [0.1, 0.2] }));
    const id = await upsertSourceWithChunks(recordingDb(log), { project: 'p', collection: 'docs', path: 'a.md', title: 'A', sha256: 's' }, chunks);
    expect(id).toBe('src-1');
    const inserts = log.filter((q) => /insert into chunks/i.test(q));
    expect(inserts).toHaveLength(3);
    expect(log.filter((q) => /delete from chunks/i.test(q))).toHaveLength(1);
  });

  it('issues no chunk insert for a source without chunks', async () => {
    const log: string[] = [];
    await upsertSourceWithChunks(recordingDb(log), { project: 'p', collection: 'docs', path: 'a.md', title: 'A', sha256: 's' }, []);
    expect(log.filter((q) => /insert into chunks/i.test(q))).toHaveLength(0);
  });
});
