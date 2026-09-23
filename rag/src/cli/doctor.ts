import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { createEmbeddingProvider } from '../embeddings.js';
import { formatStatus } from '../doctor.js';
import { collectStatus } from '../status.js';

const cfg = loadConfig();
const sql = createDb(cfg.databaseUrl);
try {
  const status = await collectStatus(cfg, { sql, provider: createEmbeddingProvider(cfg) });
  process.stdout.write(formatStatus(status));
  process.exitCode = status.ok ? 0 : 1;
} finally {
  await sql.end();
}
