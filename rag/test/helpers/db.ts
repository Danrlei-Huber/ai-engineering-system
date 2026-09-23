import { createDb, type Db } from '../../src/db.js';

export const INTEGRATION = process.env.RAG_RUN_INTEGRATION === '1';

/** Connection for integration tests. Callers must `describe.skipIf(!INTEGRATION)`. */
export function integrationDb(): Db {
  const url = process.env.RAG_TEST_DATABASE_URL ?? 'postgres://rag:rag_local_only@localhost:5433/rag';
  return createDb(url);
}

export async function resetSchema(sql: Db): Promise<void> {
  await sql.unsafe('DROP TABLE IF EXISTS chunks, sources, schema_migrations CASCADE');
}
