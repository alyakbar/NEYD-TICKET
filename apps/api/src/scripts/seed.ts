import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { hashPassword } from '../auth/password.util';

async function main() {
  config({ path: join(__dirname, '../../../../.env.local') });

  const connectionString = process.env.DATABASE_URL;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed PostgreSQL.');
  }
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error('Set INITIAL_ADMIN_PASSWORD to a unique password of at least 12 characters.');
  }
  const optionalPasswords = [
    { email: 'manager@neyd.local', password: process.env.INITIAL_MANAGER_PASSWORD },
    { email: 'agent@neyd.local', password: process.env.INITIAL_AGENT_PASSWORD },
  ];
  for (const { email, password } of optionalPasswords) {
    if (password !== undefined && password.length < 12) {
      throw new Error(`The password for ${email} must contain at least 12 characters.`);
    }
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true },
  });
  const client = await pool.connect();
  try {
    const sql = await readFile(join(__dirname, '../../seeds/postgresql/001_enterprise_seed.sql'), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'UPDATE users SET password_hash = $1 WHERE email = $2 AND active = TRUE',
        [hashPassword(adminPassword), 'admin@neyd.local'],
      );
      for (const { email, password } of optionalPasswords) {
        if (password) {
          await client.query(
            'UPDATE users SET password_hash = $1 WHERE email = $2 AND active = TRUE',
            [hashPassword(password), email],
          );
        }
      }
      await client.query('COMMIT');
      console.log('Seeded NEYD organization data and configured admin@neyd.local.');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('PostgreSQL seed failed:', error);
  process.exitCode = 1;
});
