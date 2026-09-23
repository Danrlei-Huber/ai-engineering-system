import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RagConfig } from './config.js';
import { EMBED_DIMENSIONS } from './contract.js';
import { countChunks, type Db } from './db.js';
import { assertDimension, type EmbeddingProvider } from './embeddings.js';
import { pendingMigrations } from './migrate.js';

export interface Check { name: string; ok: boolean; detail: string }
export interface RagStatus { ok: boolean; checks: Check[] }

export const DEFAULT_DIST_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'server.js');

async function run(name: string, fn: () => Promise<string>): Promise<Check> {
  try {
    return { name, ok: true, detail: await fn() };
  } catch (err) {
    return { name, ok: false, detail: (err as Error).message };
  }
}

export async function collectStatus(
  cfg: RagConfig,
  deps: { sql?: Db; provider?: EmbeddingProvider; fetchImpl?: typeof fetch; distPath?: string } = {},
): Promise<RagStatus> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const checks: Check[] = [];

  checks.push(await run('node', async () => {
    const major = Number(process.versions.node.split('.')[0]);
    if (major < 22) throw new Error(`v${process.versions.node} (need >= 22)`);
    return `v${process.versions.node}`;
  }));

  let dbOk = false;
  if (deps.sql) {
    const sql = deps.sql;
    checks.push(await run('postgres', async () => { await sql`select 1`; dbOk = true; return cfg.databaseUrl.replace(/\/\/.*@/, '//***@'); }));
    if (dbOk) {
      checks.push(await run('pgvector', async () => {
        const [row] = await sql<{ extversion: string }[]>`select extversion from pg_extension where extname = 'vector'`;
        if (!row) throw new Error('extension "vector" not installed; run npm run migrate');
        return `v${row.extversion}`;
      }));
      checks.push(await run('migrations', async () => {
        const pending = await pendingMigrations(sql);
        if (pending.length) throw new Error(`pending: ${pending.join(', ')} (run npm run migrate)`);
        return 'up to date';
      }));
      checks.push(await run('chunks', async () => `${await countChunks(sql)} indexed`));
    }
  }

  checks.push({ name: 'embedding provider', ok: true, detail: cfg.embedProvider === 'fake' ? 'fake (tests/CI only)' : `ollama ${cfg.embedModel} at ${cfg.ollamaUrl}` });

  if (cfg.embedProvider === 'ollama') {
    checks.push(await run('ollama', async () => {
      const res = await fetchImpl(`${cfg.ollamaUrl}/api/tags`);
      if (!res.ok) throw new Error(`GET /api/tags -> ${res.status}`);
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      const present = names.some((n) => n === cfg.embedModel || n.startsWith(`${cfg.embedModel}:`));
      if (!present) throw new Error(`model ${cfg.embedModel} not pulled (have: ${names.join(', ') || 'none'}); run docker compose up ollama-pull`);
      return `reachable, ${cfg.embedModel} present`;
    }));
  }

  if (deps.provider) {
    const provider = deps.provider;
    checks.push(await run('embedding dimension', async () => { await assertDimension(provider); return `${EMBED_DIMENSIONS}`; }));
  }

  const distPath = deps.distPath ?? DEFAULT_DIST_PATH;
  checks.push(await run('mcp build', async () => {
    if (!existsSync(distPath)) throw new Error(`${distPath} missing; run npm run build`);
    return distPath;
  }));

  return { ok: checks.every((c) => c.ok), checks };
}
