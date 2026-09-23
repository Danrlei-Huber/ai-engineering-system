import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { chunkMarkdown, contentHash, embedText, extractTitle } from './chunker.js';
import { COLLECTIONS, isCollection, type Collection } from './contract.js';
import { findSource, pruneSources, upsertSourceWithChunks, type Db } from './db.js';
import type { EmbeddingProvider } from './embeddings.js';

export interface IngestOptions {
  project: string;
  collection: Collection;
  /** Files or directories, relative to `root` (or absolute). */
  targets: string[];
  /** Base directory that stored paths are relative to. */
  root: string;
  /** External origin; requires exactly one file target. */
  url?: string;
  title?: string;
  prune?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IngestReport {
  ingested: string[];
  skipped: string[];
  pruned: string[];
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.planning']);

export function listMarkdownFiles(target: string): string[] {
  if (!existsSync(target)) return [];
  const stat = statSync(target);
  if (stat.isFile()) return [target];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
      } else if (/\.md$/i.test(entry.name)) {
        out.push(join(dir, entry.name));
      }
    }
  };
  walk(target);
  return out.sort();
}

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

export async function ingest(sql: Db, provider: EmbeddingProvider, opts: IngestOptions, log: (line: string) => void = () => {}): Promise<IngestReport> {
  const report: IngestReport = { ingested: [], skipped: [], pruned: [] };
  const seen: string[] = [];

  for (const target of opts.targets) {
    const absTarget = isAbsolute(target) ? target : resolve(opts.root, target);
    for (const abs of listMarkdownFiles(absTarget)) {
      const rel = toPosix(relative(opts.root, abs));
      const text = readFileSync(abs, 'utf8');
      const sha256 = createHash('sha256').update(text).digest('hex');
      const origin = opts.url ?? rel;
      seen.push(origin);

      const existing = await findSource(sql, opts.project, opts.collection, origin);
      if (existing?.sha256 === sha256) {
        report.skipped.push(rel);
        log(`skip     ${rel}`);
        continue;
      }

      const chunks = chunkMarkdown(text);
      const vectors = chunks.length ? await provider.embed(chunks.map(embedText)) : [];
      const metadata: Record<string, unknown> = { ...(opts.metadata ?? {}) };
      if (opts.url) metadata.retrieved_at = new Date().toISOString();

      await upsertSourceWithChunks(
        sql,
        {
          project: opts.project,
          collection: opts.collection,
          path: opts.url ? undefined : rel,
          url: opts.url,
          title: opts.title ?? extractTitle(text, basename(rel)),
          sha256,
          metadata,
        },
        chunks.map((c, i) => ({ position: c.position, headingPath: c.headingPath, content: c.content, contentHash: contentHash(c), embedding: vectors[i] })),
      );
      report.ingested.push(rel);
      log(`ingested ${rel} (${chunks.length} chunks)`);
    }
  }

  if (opts.prune && !opts.url) {
    for (const target of opts.targets) {
      const absTarget = isAbsolute(target) ? target : resolve(opts.root, target);
      if (!existsSync(absTarget) || !statSync(absTarget).isDirectory()) continue;
      const prefix = toPosix(relative(opts.root, absTarget)) + '/';
      const deleted = await pruneSources(sql, opts.project, opts.collection, prefix, seen);
      report.pruned.push(...deleted);
      for (const p of deleted) log(`pruned   ${p}`);
    }
  }
  return report;
}

export function parseIngestArgs(argv: string[], ctx: { defaultProject: string | undefined; cwd: string }): IngestOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      project: { type: 'string' },
      collection: { type: 'string' },
      root: { type: 'string' },
      url: { type: 'string' },
      title: { type: 'string' },
      prune: { type: 'boolean', default: false },
    },
  });
  const project = values.project ?? ctx.defaultProject;
  if (!project) throw new Error('--project is required (or run inside a project with .ai-engineering/project.yaml)');
  const collection = values.collection ?? '';
  if (!isCollection(collection)) throw new Error(`--collection must be one of ${COLLECTIONS.join(', ')}`);
  if (positionals.length === 0) throw new Error('at least one target (file or directory) is required');
  if (values.url && positionals.length !== 1) throw new Error('--url requires exactly one file target');
  return {
    project,
    collection,
    targets: positionals,
    root: values.root ? resolve(ctx.cwd, values.root) : ctx.cwd,
    url: values.url,
    title: values.title,
    prune: values.prune ?? false,
    metadata: undefined,
  };
}
