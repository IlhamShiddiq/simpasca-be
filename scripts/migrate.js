import { readdir, readFile } from 'node:fs/promises';
import { pool } from '../src/db.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(73418001)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const exists = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (exists.rowCount) continue;
    await client.query(await readFile(new URL(file, directory), 'utf8'));
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    console.log(`Applied ${file}`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}