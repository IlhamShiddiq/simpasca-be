import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { authOptions, tokenFor } from './helpers/auth.js';

test('HTTP routes, errors, JSON validation and health', async (t) => {
  const db = { query: async (sql) => sql.startsWith('SELECT id, name, username, role FROM users')
    ? { rows: [{ id: 1, name: 'Test', username: 'test', role: 'admin' }] } : { rows: [], rowCount: 0 } };
  const server = createApp(db, { auth: authOptions }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${tokenFor(1)}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal((await fetch(`${base}/api/cash-transactions/1`, { headers })).status, 404);
  assert.equal((await fetch(`${base}/api/cash-transactions/invalid`, { headers })).status, 422);
  assert.equal((await fetch(`${base}/api/cash-transactions`, {
    method: 'POST', headers, body: '{}',
  })).status, 422);
  assert.equal((await fetch(`${base}/api/cash-transactions`, {
    method: 'POST', headers, body: '{',
  })).status, 400);
  db.query = async () => { throw new Error('offline'); };
  assert.equal((await fetch(`${base}/health`)).status, 503);
});