import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeDatabaseUrl, loadConfig, readEnvFile, readProjectName } from '../src/config.js';

function tempProject(yaml?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rag-cfg-'));
  if (yaml !== undefined) {
    mkdirSync(join(dir, '.ai-engineering'));
    writeFileSync(join(dir, '.ai-engineering', 'project.yaml'), yaml);
  }
  return dir;
}

function tempEnvFile(content: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'rag-env-')), '.env');
  writeFileSync(file, content);
  return file;
}

describe('readProjectName', () => {
  it('reads project from .ai-engineering/project.yaml', () => {
    expect(readProjectName(tempProject('project: farmvision\nstack: [node]\n'))).toBe('farmvision');
  });
  it('returns undefined when the file is missing or malformed', () => {
    expect(readProjectName(tempProject())).toBeUndefined();
    expect(readProjectName(tempProject('project: [unterminated'))).toBeUndefined();
    expect(readProjectName(tempProject('stack: [node]\n'))).toBeUndefined();
  });
});

describe('loadConfig', () => {
  it('applies defaults', () => {
    const cfg = loadConfig({}, tempProject(), null);
    expect(cfg.databaseUrl).toBe('postgres://rag:rag_local_only@localhost:5433/rag');
    expect(cfg.ollamaUrl).toBe('http://localhost:11434');
    expect(cfg.embedModel).toBe('bge-m3');
    expect(cfg.embedProvider).toBe('ollama');
    expect(cfg.defaultProject).toBeUndefined();
  });
  it('reads env and strips trailing slash from OLLAMA_URL', () => {
    const cfg = loadConfig(
      { RAG_DATABASE_URL: 'postgres://x', OLLAMA_URL: 'http://ollama:11434/', RAG_EMBED_MODEL: 'other', RAG_EMBED_PROVIDER: 'fake', RAG_PROJECT: 'p' },
      tempProject('project: ignored\n'),
      null,
    );
    expect(cfg).toEqual({ databaseUrl: 'postgres://x', ollamaUrl: 'http://ollama:11434', embedModel: 'other', embedProvider: 'fake', defaultProject: 'p' });
  });
  it('falls back to project.yaml for defaultProject', () => {
    expect(loadConfig({}, tempProject('project: fishvision\n'), null).defaultProject).toBe('fishvision');
  });
});

describe('loadConfig with the compose env file', () => {
  const composeEnv = 'RAG_DB_USER=app\nRAG_DB_PASSWORD=p@ss/w\nRAG_DB_NAME=kb\nRAG_DB_PORT=5999\nOLLAMA_PORT=11500\nRAG_EMBED_MODEL=nomic-embed-text\n';

  it('derives the database and Ollama URLs from the same variables docker compose reads', () => {
    const cfg = loadConfig({}, tempProject(), tempEnvFile(composeEnv));
    expect(cfg.databaseUrl).toBe('postgres://app:p%40ss%2Fw@localhost:5999/kb');
    expect(cfg.ollamaUrl).toBe('http://localhost:11500');
    expect(cfg.embedModel).toBe('nomic-embed-text');
  });

  it('lets the process environment override the file, and explicit URLs override the compose variables', () => {
    const file = tempEnvFile(composeEnv);
    expect(loadConfig({ RAG_DB_PORT: '6000' }, tempProject(), file).databaseUrl).toBe('postgres://app:p%40ss%2Fw@localhost:6000/kb');
    expect(loadConfig({ RAG_DATABASE_URL: 'postgres://x' }, tempProject(), file).databaseUrl).toBe('postgres://x');
    expect(loadConfig({ OLLAMA_URL: 'http://ollama:1/' }, tempProject(), file).ollamaUrl).toBe('http://ollama:1');
    expect(loadConfig({}, tempProject(), tempEnvFile(composeEnv + 'RAG_DATABASE_URL=postgres://from-file\n')).databaseUrl).toBe('postgres://from-file');
  });

  it('treats empty environment values as unset (the .mcp.json ${VAR:-} form)', () => {
    const cfg = loadConfig({ RAG_DATABASE_URL: '', OLLAMA_URL: '', RAG_EMBED_MODEL: '', RAG_EMBED_PROVIDER: '' }, tempProject(), tempEnvFile(composeEnv));
    expect(cfg.databaseUrl).toBe('postgres://app:p%40ss%2Fw@localhost:5999/kb');
    expect(cfg.ollamaUrl).toBe('http://localhost:11500');
    expect(cfg.embedModel).toBe('nomic-embed-text');
    expect(cfg.embedProvider).toBe('ollama');
  });

  it('falls back to the compose defaults when the file is missing', () => {
    const cfg = loadConfig({}, tempProject(), join(tmpdir(), 'rag-env-missing', '.env'));
    expect(cfg.databaseUrl).toBe('postgres://rag:rag_local_only@localhost:5433/rag');
    expect(cfg.ollamaUrl).toBe('http://localhost:11434');
  });
});

describe('readEnvFile and composeDatabaseUrl', () => {
  it('parses KEY=value lines and returns {} for a missing file', () => {
    expect(readEnvFile(tempEnvFile('# comment\nA=1\nB="two words"\n'))).toEqual({ A: '1', B: 'two words' });
    expect(readEnvFile(join(tmpdir(), 'rag-env-missing', '.env'))).toEqual({});
  });
  it('builds the URL from compose variables with an optional database name override', () => {
    expect(composeDatabaseUrl({})).toBe('postgres://rag:rag_local_only@localhost:5433/rag');
    expect(composeDatabaseUrl({ RAG_DB_PORT: '5999' }, 'rag_test')).toBe('postgres://rag:rag_local_only@localhost:5999/rag_test');
  });
});
