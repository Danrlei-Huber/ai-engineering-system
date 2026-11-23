import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import YAML from 'yaml';
import { EMBED_MODEL_DEFAULT } from './contract.js';

export interface RagConfig {
  databaseUrl: string;
  ollamaUrl: string;
  embedModel: string;
  embedProvider: 'ollama' | 'fake';
  /** Project scope used when a tool call does not name one. */
  defaultProject: string | undefined;
}

/** `rag/.env`: the file docker compose reads. Resolved from src/ (tsx) and dist/ (node) alike. */
export const DEFAULT_ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');

type Vars = Record<string, string | undefined>;

/** Parses a dotenv-style file; `{}` when absent or unreadable. Never throws. */
export function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  try {
    return definedVars(parseEnv(readFileSync(file, 'utf8')));
  } catch {
    return {};
  }
}

/**
 * Builds the Postgres URL from the variables docker compose uses (`RAG_DB_USER`, `RAG_DB_PASSWORD`,
 * `RAG_DB_NAME`, `RAG_DB_PORT`), so changing a port or password in `rag/.env` moves the CLIs and the
 * MCP server with it. The host is always localhost: compose publishes the port there.
 */
export function composeDatabaseUrl(vars: Vars, dbName?: string): string {
  const user = encodeURIComponent(vars.RAG_DB_USER ?? 'rag');
  const password = encodeURIComponent(vars.RAG_DB_PASSWORD ?? 'rag_local_only');
  const port = vars.RAG_DB_PORT ?? '5433';
  const name = encodeURIComponent(dbName ?? vars.RAG_DB_NAME ?? 'rag');
  return `postgres://${user}:${password}@localhost:${port}/${name}`;
}

export const DEFAULT_DATABASE_URL = composeDatabaseUrl({});
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/** Reads `project` from <cwd>/.ai-engineering/project.yaml; undefined when absent or unreadable. */
export function readProjectName(cwd: string): string | undefined {
  const file = join(cwd, '.ai-engineering', 'project.yaml');
  if (!existsSync(file)) return undefined;
  try {
    const doc: unknown = YAML.parse(readFileSync(file, 'utf8'));
    const project = (doc as { project?: unknown } | null)?.project;
    return typeof project === 'string' && project.trim() ? project.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Process environment entries that carry a value; `""` counts as unset (`.mcp.json` passes `${VAR:-}`). */
function definedVars(env: Vars): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v) out[k] = v;
  return out;
}

/**
 * Precedence: process environment, then `envFile` (default `rag/.env`), then the compose defaults.
 * `RAG_DATABASE_URL` and `OLLAMA_URL` win over the compose-style variables they are derived from.
 * Pass `envFile: null` to ignore the file (tests).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd(), envFile: string | null = DEFAULT_ENV_FILE): RagConfig {
  const vars: Vars = { ...(envFile ? readEnvFile(envFile) : {}), ...definedVars(env) };
  return {
    databaseUrl: vars.RAG_DATABASE_URL ?? composeDatabaseUrl(vars),
    ollamaUrl: (vars.OLLAMA_URL ?? `http://localhost:${vars.OLLAMA_PORT ?? '11434'}`).replace(/\/+$/, ''),
    embedModel: vars.RAG_EMBED_MODEL ?? EMBED_MODEL_DEFAULT,
    embedProvider: vars.RAG_EMBED_PROVIDER === 'fake' ? 'fake' : 'ollama',
    defaultProject: vars.RAG_PROJECT ?? readProjectName(cwd),
  };
}
