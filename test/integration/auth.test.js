import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/db.js';
import { createApp } from '../../src/app.js';
import { authOptions, passwordHash } from '../helpers/auth.js';

test('PostgreSQL HTTP: login, me, protected API and persistent logout', async (t) => {
  const client = await pool.connect();
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await client.query('ROLLBACK'); client.release(); await pool.end();
  });
  await client.query('BEGIN');
  const username = `auth-${randomUUID()}`;
  const password = 'test-password-123';
  const user = (await client.query("INSERT INTO users (name, username, password_hash, role) VALUES ('Auth test', $1, $2, 'SUPERADMIN') RETURNING id", [username, passwordHash(password)])).rows[0];
  server = createApp(client, { auth: authOptions }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = () => fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const response = await login();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = (await response.json()).data;
  assert.equal(data.user.id, user.id);
  assert.equal(data.user.password_hash, undefined);
  const headers = { Authorization: `Bearer ${data.access_token}` };
  assert.equal((await fetch(`${base}/cash-transactions`, { headers })).status, 200);
  await client.query("UPDATE users SET name = 'New name' WHERE id = $1", [user.id]);
  const me = await fetch(`${base}/auth/me`, { headers });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).data.name, 'New name');
  const secondToken = (await (await login()).json()).data.access_token;
  assert.equal((await fetch(`${base}/auth/logout`, { method: 'POST', headers })).status, 204);
  for (const path of ['auth/me', 'cash-transactions', 'users']) assert.equal((await fetch(`${base}/${path}`, { headers })).status, 401);
  assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${secondToken}` } })).status, 200);
  // Restarting the Express app does not restore revoked tokens.
  const persisted = await client.query('SELECT COUNT(*)::integer AS total FROM auth_revoked_tokens');
  assert.ok(persisted.rows[0].total >= 1);
  await new Promise((resolve) => server.close(resolve));
  server = createApp(client, { auth: authOptions }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const restarted = `http://127.0.0.1:${server.address().port}/api`;
  assert.equal((await fetch(`${restarted}/auth/me`, { headers })).status, 401);
  await client.query('DELETE FROM users WHERE id = $1', [user.id]);
  assert.equal((await fetch(`${restarted}/auth/me`, { headers: { Authorization: `Bearer ${secondToken}` } })).status, 401);
});