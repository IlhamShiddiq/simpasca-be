import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/db.js';
import { modules } from '../helpers/modules.js';
import { authOptions, tokenFor } from '../helpers/auth.js';

test('PostgreSQL HTTP: all ERD resource APIs, filters, CRUD, append-only and constraints', async (t) => {
  const client = await pool.connect();
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  });
  await client.query('BEGIN');
  const actor = (await client.query("INSERT INTO users (name, username, password_hash, role) VALUES ('Actor', $1, 'test-only', 'admin') RETURNING id", [randomUUID()])).rows[0];
  const token = tokenFor(actor.id);
  server = createApp(client, { auth: authOptions }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, method = 'GET', body) => fetch(`${base}/${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const created = {};
  const payloads = {};
  const create = async (path, payload) => {
    const response = await request(path, 'POST', payload);
    const body = await response.json();
    assert.equal(response.status, 201, `${path}: ${JSON.stringify(body)}`);
    assert.equal(response.headers.get('location'), `/api/${path}/${body.data.id}`);
    created[path] = body.data;
    payloads[path] = payload;
    return body.data;
  };
  const user = await create('users', { name: 'API test', username: `api-${randomUUID()}`, password: 'a-test-password-only', role: 'admin' });
  assert.equal(user.password_hash, undefined);
  assert.equal(user.password, undefined);
  const hash = (await client.query('SELECT password_hash FROM users WHERE id = $1', [user.id])).rows[0].password_hash;
  assert.match(hash, /^scrypt:/);
  const disaster = await create('disasters', {
    disaster_type: 'flood', province: 'Jawa Barat', regency_city: 'Bandung', latitude: '-6.9175000', longitude: '107.6191000',
    status: 'active', handling_scale: 'city', occurred_at: '2026-11-21T00:00:00Z', created_by: user.id,
  });
  const item = await create('inventory-items', { name: 'Rice', category: 'food', stock_unit: 'kg', initial_stock: '10.125', created_by: user.id });
  assert.equal(item.initial_stock, '10.125');
  const shipment = await create('shipments', {
    disaster_id: disaster.id, status: 'draft', destination: 'Bandung', person_in_charge: 'Test', request_key: randomUUID(), created_by: user.id,
  });
  const shipmentItem = await create('shipment-items', { shipment_id: shipment.id, item_id: item.id, quantity: '1.125' });
  const receipt = await create('stock-receipts', {
    item_id: item.id, quantity: '2.125', receipt_date: '2026-11-21', source_giver: 'Donor', item_condition: 'good', request_key: randomUUID(), created_by: user.id,
  });
  assert.equal(receipt.receipt_date, '2026-11-21');
  const movement = await create('stock-movements', {
    item_id: item.id, receipt_id: receipt.id, movement_type: 'receipt', quantity_in: '2.125', movement_date: '2026-11-21', created_by: user.id,
  });
  assert.equal(movement.quantity_in, '2.125');
  const snapshot = { disaster_id: disaster.id, items: [{ item_id: item.id, quantity: '1.125' }] };
  const report = await create('generated-reports', { disaster_id: disaster.id, report_snapshot: snapshot, generated_by: user.id, generated_by_name: user.name });
  assert.deepEqual(report.report_snapshot, snapshot);
  const audit = await create('audit-logs', { user_id: user.id, action: 'create', entity_type: 'shipments', entity_id: shipment.id, after_data: { status: 'draft' } });
  assert.deepEqual(audit.after_data, { status: 'draft' });

  for (const resource of modules) {
    const path = resource.path;
    const row = created[path];
    const detail = await request(`${path}/${row.id}`);
    assert.equal(detail.status, 200, path);
    assert.deepEqual((await detail.json()).data, row);
    const filter = resource.filters[0];
    const list = await request(`${path}?${filter}=${encodeURIComponent(payloads[path][filter])}&limit=100`);
    assert.equal(list.status, 200, path);
    const page = await list.json();
    assert.ok(page.data.some((entry) => entry.id === row.id), path);
    assert.ok(page.data.every((entry) => String(entry[filter]) === String(payloads[path][filter])), path);
    assert.equal(page.meta.limit, 100);
    assert.ok(page.meta.total >= 1);
    assert.equal((await request(`${path}?limit=101`)).status, 422);
    assert.equal((await request(`${path}?unknown=1`)).status, 422);
    assert.equal((await request(`${path}/2147483648`)).status, 422);
    assert.equal((await request(`${path}/2147483647`)).status, 404);
    assert.equal((await request(path, 'POST', { ...payloads[path], unknown: true })).status, 422);
    if (resource.appendOnly) {
      assert.equal((await request(`${path}/${row.id}`, 'PATCH', {})).status, 404);
      assert.equal((await request(`${path}/${row.id}`, 'DELETE')).status, 404);
    }
  }

  const expectDbError = async (path, method, body, expected) => {
    await client.query('SAVEPOINT api_constraint');
    const response = await request(path, method, body);
    assert.equal(response.status, expected, `${method} ${path}: ${await response.text()}`);
    await client.query('ROLLBACK TO SAVEPOINT api_constraint');
  };
  await expectDbError('users', 'POST', payloads.users, 409);
  await expectDbError(`users/${user.id}`, 'DELETE', undefined, 409);
  await expectDbError(`disasters/${disaster.id}`, 'DELETE', undefined, 409);
  await expectDbError(`inventory-items/${item.id}`, 'DELETE', undefined, 409);
  await expectDbError('shipments', 'POST', { ...payloads.shipments, request_key: randomUUID(), disaster_id: 2147483647 }, 422);
  await expectDbError(`shipments/${shipment.id}`, 'PATCH', { received_at: '2026-11-21T12:00:00Z' }, 422);
  await expectDbError('shipment-items', 'POST', payloads['shipment-items'], 409);

  const changes = {
    users: { name: 'Updated user', password: 'updated-test-password' }, disasters: { affected_people: 10 },
    'inventory-items': { name: 'Updated rice' }, shipments: { status: 'shipped', shipped_at: '2026-11-21T10:00:00Z' },
    'shipment-items': { quantity: '2.000' }, 'stock-receipts': { notes: 'Updated receipt' },
  };
  for (const [path, body] of Object.entries(changes)) {
    const response = await request(`${path}/${created[path].id}`, 'PATCH', body);
    assert.equal(response.status, 200, path);
    const updated = (await response.json()).data;
    assert.equal(updated.password_hash, undefined);
    for (const [key, value] of Object.entries(body)) {
      if (key === 'password' || key.endsWith('_at')) continue;
      assert.equal(updated[key], value, `${path}.${key}`);
    }
  }
  const updatedHash = (await client.query('SELECT password_hash FROM users WHERE id = $1', [user.id])).rows[0].password_hash;
  assert.notEqual(updatedHash, hash);
  for (const path of ['shipments', 'shipment-items', 'stock-receipts']) {
    const id = created[path].id;
    assert.equal((await request(`${path}/${id}`, 'DELETE')).status, 204);
    assert.equal((await request(`${path}/${id}`)).status, 404);
    assert.equal((await request(`${path}/${id}`, 'DELETE')).status, 404);
    assert.equal((await request(`${path}/${id}`, 'PATCH', changes[path])).status, 404);
    await expectDbError(path, 'POST', payloads[path], 409);
  }
  // Unreferenced entities can be hard-deleted.
  const spare = await create('inventory-items', { name: 'Spare', category: 'test', stock_unit: 'pcs', created_by: user.id });
  assert.equal((await request(`inventory-items/${spare.id}`, 'DELETE')).status, 204);
  assert.equal((await request(`inventory-items/${spare.id}`)).status, 404);
});