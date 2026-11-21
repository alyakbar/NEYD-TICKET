import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Pool } from 'pg';

async function main() {
  config({ path: join(__dirname, '../../../../.env.local') });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run PostgreSQL migrations.');
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true },
  });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const directory = join(__dirname, '../../migrations/postgresql');
    const files = (await readdir(directory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    for (const file of files) {
      const { rowCount } = await client.query('SELECT name FROM schema_migrations WHERE name = $1', [file]);
      if (rowCount) continue;

      const sql = await readFile(join(directory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('PostgreSQL migration failed:', error);
  process.exitCode = 1;
});
