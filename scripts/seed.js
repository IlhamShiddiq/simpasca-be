import { randomBytes, scryptSync } from 'node:crypto';
import { pool } from '../src/db.js';

try {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error('Isi SEED_ADMIN_PASSWORD minimal 12 karakter di .env.');
  const salt = randomBytes(16).toString('hex');
  const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  const result = await pool.query(
    `INSERT INTO users (name, username, password_hash, role)
     VALUES ('Administrator', 'admin', $1, 'admin')
     ON CONFLICT (username) DO NOTHING RETURNING id, name, username, role`, [hash],
  );
  const user = result.rows[0] || (await pool.query("SELECT id, name, username, role FROM users WHERE username = 'admin'")).rows[0];
  console.log('User tersedia (password existing tidak diubah):', user);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}