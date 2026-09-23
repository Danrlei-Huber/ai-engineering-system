import { describe, expect, it } from 'vitest';
import { chunkMarkdown, contentHash, embedText, extractTitle } from '../src/chunker.js';

const doc = `# Guide

Intro paragraph.

## Setup

Install things.

### Docker

\`\`\`bash
# not a heading
docker compose up -d
\`\`\`

## Usage

Run it.
`;

describe('chunkMarkdown', () => {
  it('splits on headings and records the heading path', () => {
    const chunks = chunkMarkdown(doc);
    expect(chunks.map((c) => c.headingPath)).toEqual(['Guide', 'Guide > Setup', 'Guide > Setup > Docker', 'Guide > Usage']);
    expect(chunks.map((c) => c.position)).toEqual([0, 1, 2, 3]);
    expect(chunks[0].content).toBe('Intro paragraph.');
  });

  it('keeps fenced code intact and ignores # inside fences', () => {
    const docker = chunkMarkdown(doc).find((c) => c.headingPath.endsWith('Docker'))!;
    expect(docker.content).toContain('# not a heading');
    expect(docker.content).toContain('docker compose up -d');
  });

  it('drops empty sections', () => {
    expect(chunkMarkdown('# Only\n\n## Empty\n\n## Full\n\ntext')).toHaveLength(1);
  });

  it('splits oversized sections by paragraph with one-paragraph overlap', () => {
    const paras = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} ${'x'.repeat(300)}`);
    const chunks = chunkMarkdown(`# Big\n\n${paras.join('\n\n')}`, { maxChars: 1000 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.headingPath).toBe('Big');
    // overlap: the last paragraph of chunk N is the first of chunk N+1
    for (let i = 1; i < chunks.length; i++) {
      const prevLast = chunks[i - 1].content.split('\n\n').at(-1);
      expect(chunks[i].content.split('\n\n')[0]).toBe(prevLast);
    }
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
  });

  it('handles documents without headings', () => {
    const chunks = chunkMarkdown('just text\n\nmore text');
    expect(chunks).toEqual([{ position: 0, headingPath: '', content: 'just text\n\nmore text' }]);
  });
});

describe('embedText and contentHash', () => {
  it('prefixes the heading path before embedding', () => {
    expect(embedText({ position: 0, headingPath: 'A > B', content: 'body' })).toBe('A > B\n\nbody');
    expect(embedText({ position: 0, headingPath: '', content: 'body' })).toBe('body');
  });
  it('hashes heading path and content deterministically', () => {
    const a = contentHash({ position: 0, headingPath: 'A', content: 'x' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash({ position: 9, headingPath: 'A', content: 'x' })).toBe(a);
    expect(contentHash({ position: 0, headingPath: 'B', content: 'x' })).not.toBe(a);
  });
});

describe('extractTitle', () => {
  it('uses the first H1, else the fallback', () => {
    expect(extractTitle(doc, 'file.md')).toBe('Guide');
    expect(extractTitle('no title here', 'file.md')).toBe('file.md');
  });
  it('strips trailing ATX closing hashes', () => {
    expect(extractTitle('# My Title ###', 'x')).toBe('My Title');
  });
});
