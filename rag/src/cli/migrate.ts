import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { migrate } from '../migrate.js';

const cfg = loadConfig();
const sql = createDb(cfg.databaseUrl);
try {
  const applied = await migrate(sql);
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'migrations: up to date');
} catch (err) {
  console.error(`migrate failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
