import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

export const DEFAULT_DATABASE_URL = 'postgres://rag:rag_local_only@localhost:5433/rag';
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): RagConfig {
  return {
    databaseUrl: env.RAG_DATABASE_URL ?? DEFAULT_DATABASE_URL,
    ollamaUrl: (env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL).replace(/\/+$/, ''),
    embedModel: env.RAG_EMBED_MODEL ?? EMBED_MODEL_DEFAULT,
    embedProvider: env.RAG_EMBED_PROVIDER === 'fake' ? 'fake' : 'ollama',
    defaultProject: env.RAG_PROJECT ?? readProjectName(cwd),
  };
}
