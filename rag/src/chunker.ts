import { createHash } from 'node:crypto';

export interface Chunk {
  position: number;
  /** "Doc > Section > Subsection"; empty when the text precedes any heading. */
  headingPath: string;
  content: string;
}

export interface ChunkOptions {
  /** Sections longer than this are split by paragraph. Default 1800. */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 1800;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;

interface Section {
  headingPath: string[];
  lines: string[];
}

export function extractTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+?)(?:\s+#+)?\s*$/m);
  return match ? match[1].trim() : fallback;
}

export function chunkMarkdown(markdown: string, options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const chunks: Chunk[] = [];
  for (const section of splitSections(markdown)) {
    const body = section.lines.join('\n').trim();
    if (!body) continue;
    const headingPath = section.headingPath.join(' > ');
    for (const content of splitOversized(body, maxChars)) {
      chunks.push({ position: chunks.length, headingPath, content });
    }
  }
  return chunks;
}

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [{ headingPath: [], lines: [] }];
  const stack: { level: number; text: string }[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE.test(line)) inFence = !inFence;
    const heading = inFence ? null : line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: heading[2].trim() });
      sections.push({ headingPath: stack.map((s) => s.text), lines: [] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }
  return sections;
}

/** Splits a section body into paragraphs and fenced code blocks (each fence is one block). */
function splitBlocks(body: string): string[] {
  const blocks: string[] = [];
  let buffer: string[] = [];
  let inFence = false;
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) blocks.push(text);
    buffer = [];
  };
  for (const line of body.split('\n')) {
    if (FENCE.test(line)) {
      if (!inFence) flush();
      buffer.push(line);
      inFence = !inFence;
      if (!inFence) flush();
      continue;
    }
    if (!inFence && line.trim() === '') {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return blocks;
}

/** Splits a section into chunks respecting maxChars; a single fenced block larger than maxChars is emitted whole to keep the fence intact. */
function splitOversized(body: string, maxChars: number): string[] {
  if (body.length <= maxChars) return [body];
  const out: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const block of splitBlocks(body)) {
    if (current.length && size + block.length + 2 > maxChars) {
      out.push(current.join('\n\n'));
      const last = current[current.length - 1];
      // one-paragraph overlap, unless that paragraph alone would dominate the next chunk
      current = last.length <= maxChars / 2 ? [last] : [];
      size = current.reduce((n, b) => n + b.length, 0);
    }
    current.push(block);
    size += block.length + 2;
  }
  if (current.length) out.push(current.join('\n\n'));
  return out;
}

/** Text that is embedded: heading path first so the vector carries document context. */
export function embedText(chunk: Chunk): string {
  return chunk.headingPath ? `${chunk.headingPath}\n\n${chunk.content}` : chunk.content;
}

/** Stable id for a chunk's meaning: sha256(headingPath + "\n" + content). Position is excluded on purpose. */
export function contentHash(chunk: Chunk): string {
  return createHash('sha256').update(chunk.headingPath).update('\n').update(chunk.content).digest('hex');
}
