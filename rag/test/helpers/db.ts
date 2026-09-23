import { createDb, type Db } from '../../src/db.js';

export const INTEGRATION = process.env.RAG_RUN_INTEGRATION === '1';

/**
 * Integration tests run against a throwaway database, never the dev one:
 * `resetSchema` drops sources/chunks/schema_migrations, so pointing this at the
 * dev database (`rag`) would wipe the knowledge base on every test run.
 */
export const TEST_DATABASE_URL =
  process.env.RAG_TEST_DATABASE_URL ?? 'postgres://rag:rag_local_only@localhost:5433/rag_test';

function maintenanceUrl(url: string): string {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
}

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

/** Creates the test database when it is missing (`create database` cannot run in a transaction). */
export async function ensureTestDatabase(url: string = TEST_DATABASE_URL): Promise<void> {
  const name = databaseName(url);
  const admin = createDb(maintenanceUrl(url));
  try {
    const rows = await admin<{ one: number }[]>`select 1 as one from pg_database where datname = ${name}`;
    if (rows.length === 0) await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
}

/** Connection for integration tests. Callers must `describe.skipIf(!INTEGRATION)`. */
export async function integrationDb(): Promise<Db> {
  await ensureTestDatabase(TEST_DATABASE_URL);
  return createDb(TEST_DATABASE_URL);
}

export async function resetSchema(sql: Db): Promise<void> {
  await sql.unsafe('DROP TABLE IF EXISTS chunks, sources, schema_migrations CASCADE');
}
