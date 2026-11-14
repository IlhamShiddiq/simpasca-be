import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/db.js';
import { createApp } from '../../src/app.js';

test('PostgreSQL: CRUD, foreign key, duplicate key, summary and soft delete', async (t) => {
  const client = await pool.connect();
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  });
  await client.query('BEGIN');
  const user = (await client.query(
    "INSERT INTO users (name, username, password_hash, role) VALUES ('Test', $1, 'test-only', 'admin') RETURNING id",
    [`test-${randomUUID()}`],
  )).rows[0];
  server = createApp(client).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/cash-transactions`;
  const request = (path = '', method = 'GET', body) => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const payload = { type: 'income', amount: '123.45', description: 'Test', transaction_date: '2026-11-14', request_key: randomUUID(), created_by: user.id };
  const response = await request('', 'POST', payload);
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(data.amount, '123.45');
  assert.equal((await (await request(`/${data.id}`)).json()).data.transaction_date, payload.transaction_date);
  const list = await (await request('?limit=100')).json();
  assert.equal(list.data.find((row) => row.id === data.id).amount, '123.45');
  const before = (await (await request('/summary')).json()).data;
  assert.equal((await request(`/${data.id}`, 'PATCH', { amount: '100.00' })).status, 200);
  const after = (await (await request('/summary')).json()).data;
  assert.equal(Math.round(Number(before.total_income) * 100) - Math.round(Number(after.total_income) * 100), 2345);
  // Savepoints allow intentional constraint violations without aborting the outer transaction.
  await client.query('SAVEPOINT duplicate');
  assert.equal((await request('', 'POST', payload)).status, 409);
  await client.query('ROLLBACK TO SAVEPOINT duplicate');
  await client.query('SAVEPOINT foreign_key');
  assert.equal((await request('', 'POST', { ...payload, request_key: randomUUID(), created_by: 2147483647 })).status, 422);
  await client.query('ROLLBACK TO SAVEPOINT foreign_key');
  assert.equal((await request(`/${data.id}`, 'DELETE')).status, 204);
  assert.equal((await request(`/${data.id}`)).status, 404);
  assert.equal((await request(`/${data.id}`, 'PATCH', { amount: '1' })).status, 404);
  const row = (await client.query('SELECT deleted_at FROM cash_transactions WHERE id = $1', [data.id])).rows[0];
  assert.ok(row.deleted_at);
  await client.query('SAVEPOINT deleted_duplicate');
  assert.equal((await request('', 'POST', payload)).status, 409);
  await client.query('ROLLBACK TO SAVEPOINT deleted_duplicate');
});