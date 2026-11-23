import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { migrate, rollback } from '../migrate.js';

const down = process.argv.slice(2).includes('--down');
const cfg = loadConfig();
const sql = createDb(cfg.databaseUrl);
try {
  if (down) {
    const name = await rollback(sql);
    console.log(name ? `rolled back: ${name}` : 'migrations: nothing to roll back');
  } else {
    const applied = await migrate(sql);
    console.log(applied.length ? `applied: ${applied.join(', ')}` : 'migrations: up to date');
  }
} catch (err) {
  console.error(`migrate failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
