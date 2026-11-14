import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('HTTP routes, errors, JSON validation and health', async (t) => {
  const db = { query: async () => ({ rows: [] }) };
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal((await fetch(`${base}/api/cash-transactions/1`)).status, 404);
  assert.equal((await fetch(`${base}/api/cash-transactions/invalid`)).status, 422);
  assert.equal((await fetch(`${base}/api/cash-transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })).status, 422);
  assert.equal((await fetch(`${base}/api/cash-transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  })).status, 400);
  db.query = async () => { throw new Error('offline'); };
  assert.equal((await fetch(`${base}/health`)).status, 503);
});