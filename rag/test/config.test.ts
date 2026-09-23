import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, readProjectName } from '../src/config.js';

function tempProject(yaml?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rag-cfg-'));
  if (yaml !== undefined) {
    mkdirSync(join(dir, '.ai-engineering'));
    writeFileSync(join(dir, '.ai-engineering', 'project.yaml'), yaml);
  }
  return dir;
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
    const cfg = loadConfig({}, tempProject());
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
    );
    expect(cfg).toEqual({ databaseUrl: 'postgres://x', ollamaUrl: 'http://ollama:11434', embedModel: 'other', embedProvider: 'fake', defaultProject: 'p' });
  });
  it('falls back to project.yaml for defaultProject', () => {
    expect(loadConfig({}, tempProject('project: fishvision\n')).defaultProject).toBe('fishvision');
  });
});
