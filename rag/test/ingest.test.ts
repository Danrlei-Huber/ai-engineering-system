import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertUrlTarget, listMarkdownFiles, parseIngestArgs } from '../src/ingest.js';

describe('listMarkdownFiles', () => {
  it('walks directories recursively, skipping node_modules and .git, and accepts a single file', () => {
    const root = mkdtempSync(join(tmpdir(), 'rag-ls-'));
    mkdirSync(join(root, 'docs', 'sub'), { recursive: true });
    mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
    mkdirSync(join(root, '.git'), { recursive: true });
    writeFileSync(join(root, 'docs', 'a.md'), '# a');
    writeFileSync(join(root, 'docs', 'sub', 'b.MD'), '# b');
    writeFileSync(join(root, 'docs', 'c.txt'), 'no');
    writeFileSync(join(root, 'node_modules', 'x', 'r.md'), '# r');
    writeFileSync(join(root, '.git', 'g.md'), '# g');
    expect(listMarkdownFiles(join(root, 'docs')).map((p) => p.slice(root.length + 1)).sort()).toEqual(['docs/a.md', 'docs/sub/b.MD']);
    expect(listMarkdownFiles(join(root, 'docs', 'a.md'))).toEqual([join(root, 'docs', 'a.md')]);
    expect(listMarkdownFiles(join(root, 'missing'))).toEqual([]);
  });
});

describe('parseIngestArgs', () => {
  it('parses flags and positionals', () => {
    const o = parseIngestArgs(['--project', 'p', '--collection', 'decisions', '--prune', 'docs/decisions', 'README.md'], { defaultProject: undefined, cwd: '/w' });
    expect(o).toEqual({ project: 'p', collection: 'decisions', targets: ['docs/decisions', 'README.md'], root: '/w', prune: true, url: undefined, title: undefined, metadata: undefined });
  });
  it('defaults project from config and root from cwd, and honours --root', () => {
    expect(parseIngestArgs(['--collection', 'docs', 'docs'], { defaultProject: 'farm', cwd: '/w' }).project).toBe('farm');
    expect(parseIngestArgs(['--root', '/elsewhere', '--collection', 'docs', 'docs'], { defaultProject: 'farm', cwd: '/w' }).root).toBe('/elsewhere');
  });
  it('rejects unknown collections, missing project, missing targets, and --url with several targets', () => {
    expect(() => parseIngestArgs(['--project', 'p', '--collection', 'nope', 'x'], { defaultProject: undefined, cwd: '/w' })).toThrow(/collection must be one of docs, decisions, standards, external/);
    expect(() => parseIngestArgs(['--collection', 'docs', 'x'], { defaultProject: undefined, cwd: '/w' })).toThrow(/--project is required/);
    expect(() => parseIngestArgs(['--project', 'p', '--collection', 'docs'], { defaultProject: undefined, cwd: '/w' })).toThrow(/at least one target/);
    expect(() => parseIngestArgs(['--project', 'p', '--collection', 'external', '--url', 'https://x', 'a.md', 'b.md'], { defaultProject: undefined, cwd: '/w' })).toThrow(/--url requires exactly one file/);
  });
});

describe('assertUrlTarget', () => {
  const root = mkdtempSync(join(tmpdir(), 'rag-url-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'a.md'), '# a');

  it('accepts a single regular file, relative or absolute', () => {
    expect(() => assertUrlTarget(root, ['docs/a.md'])).not.toThrow();
    expect(() => assertUrlTarget(root, [join(root, 'docs', 'a.md')])).not.toThrow();
  });
  it('rejects a directory target', () => {
    expect(() => assertUrlTarget(root, ['docs'])).toThrow('--url requires exactly one file target (got a directory)');
  });
  it('rejects several targets and a missing one', () => {
    expect(() => assertUrlTarget(root, ['docs/a.md', 'docs'])).toThrow(/--url requires exactly one file target$/);
    expect(() => assertUrlTarget(root, ['docs/nope.md'])).toThrow(/does not exist/);
  });
});
