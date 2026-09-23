import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { assertDimension, createEmbeddingProvider } from '../embeddings.js';
import { ingest, parseIngestArgs } from '../ingest.js';

const cfg = loadConfig();
let opts;
try {
  opts = parseIngestArgs(process.argv.slice(2), { defaultProject: cfg.defaultProject, cwd: process.cwd() });
} catch (err) {
  console.error((err as Error).message);
  console.error('usage: ingest [--root <dir>] --project <p> --collection <docs|decisions|standards|external> [--url <u> --title <t>] [--prune] <target...>');
  process.exit(2);
}

const sql = createDb(cfg.databaseUrl);
const provider = createEmbeddingProvider(cfg);
try {
  await assertDimension(provider);
  const report = await ingest(sql, provider, opts, (line) => console.log(line));
  console.log(`done: ${report.ingested.length} ingested, ${report.skipped.length} skipped, ${report.pruned.length} pruned`);
} catch (err) {
  console.error(`ingest failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
