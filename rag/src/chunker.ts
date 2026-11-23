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
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
const HEADING = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;

interface Section {
  headingPath: string[];
  lines: string[];
}

/** An open fenced code block: the marker character and how many of them opened it. */
interface Fence {
  marker: string;
  length: number;
}

/**
 * Fence state after `line` (CommonMark): a fence opens on 3+ backticks or tildes and closes
 * only on a line of the same marker, at least as long, with nothing after it. A different
 * marker, or a shorter run, inside an open fence is content. Returns the same object when
 * nothing changed, so callers can detect transitions by identity.
 */
function fenceAfter(line: string, open: Fence | null): Fence | null {
  const match = line.match(FENCE);
  if (!match) return open;
  const marker = match[1][0];
  const length = match[1].length;
  if (!open) return { marker, length };
  if (marker === open.marker && length >= open.length && match[2].trim() === '') return null;
  return open;
}

export function extractTitle(markdown: string, fallback: string): string {
  let fence: Fence | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const next = fenceAfter(line, fence);
    if (next !== fence) { fence = next; continue; }
    if (fence) continue;
    const match = line.match(/^#\s+(.+?)(?:\s+#+)?\s*$/);
    if (match) return match[1].trim();
  }
  return fallback;
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
  let fence: Fence | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    fence = fenceAfter(line, fence);
    const heading = fence ? null : line.match(HEADING);
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
  let fence: Fence | null = null;
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) blocks.push(text);
    buffer = [];
  };
  for (const line of body.split('\n')) {
    const next = fenceAfter(line, fence);
    if (next !== fence) {
      if (!fence) flush();
      buffer.push(line);
      fence = next;
      if (!fence) flush();
      continue;
    }
    if (!fence && line.trim() === '') {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return blocks;
}

/**
 * Splits a section into chunks respecting maxChars. A single block (paragraph or fenced code)
 * larger than maxChars is emitted whole: paragraphs are never cut mid-sentence and fences stay intact.
 */
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
