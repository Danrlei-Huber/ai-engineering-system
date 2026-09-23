import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.js';

// Works from src/ (tsx) and from dist/ (node): both are one level under rag/.
export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export function listMigrationFiles(dir: string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

export async function appliedMigrations(sql: Db): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const rows = await sql<{ name: string }[]>`select name from schema_migrations order by name`;
  return rows.map((r) => r.name);
}

export async function pendingMigrations(sql: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const applied = new Set(await appliedMigrations(sql));
  return listMigrationFiles(dir).filter((f) => !applied.has(f));
}

/**
 * Pending migrations without any DDL: assumes `schema_migrations` exists (callers that
 * must not create it, such as rag_status, check `to_regclass` first).
 */
export async function pendingMigrationsReadOnly(sql: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`select name from schema_migrations`;
  const applied = new Set(rows.map((r) => r.name));
  return listMigrationFiles(dir).filter((f) => !applied.has(f));
}

/** Applies each pending migration in its own transaction. Returns the names applied. */
export async function migrate(sql: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const pending = await pendingMigrations(sql, dir);
  for (const name of pending) {
    const body = readFileSync(join(dir, name), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${name})`;
    });
  }
  return pending;
}
