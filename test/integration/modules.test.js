import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/db.js';
import { modules } from '../helpers/modules.js';
import { authOptions, tokenFor } from '../helpers/auth.js';

test('PostgreSQL HTTP: resource APIs, derived stock, audit, roles, public reads and constraints', async (t) => {
  const client = await pool.connect();
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  });
  await client.query('BEGIN');
  const actor = (await client.query("INSERT INTO users (name, username, password_hash, role) VALUES ('Actor', $1, 'test-only', 'SUPERADMIN') RETURNING id, name", [randomUUID()])).rows[0];
  const token = tokenFor(actor.id);
  server = createApp(client, { auth: authOptions }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, method = 'GET', body, auth = token) => fetch(`${base}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth && { Authorization: `Bearer ${auth}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = async (response) => (await response.json()).data;
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
  const stockOf = async (itemId) => Number((await client.query(
    'SELECT COALESCE(SUM(quantity_in - quantity_out), 0) AS stock FROM stock_movements WHERE item_id = $1', [itemId],
  )).rows[0].stock);

  const user = await create('users', { name: 'API test', username: `api-${randomUUID()}`, password: 'a-test-password-only', role: 'PETUGAS' });
  assert.equal(user.password_hash, undefined);
  const hash = (await client.query('SELECT password_hash FROM users WHERE id = $1', [user.id])).rows[0].password_hash;
  assert.match(hash, /^scrypt:/);
  // created_by always comes from the token.
  const disaster = await create('disasters', {
    disaster_type: 'Banjir', province: 'Jawa Barat', regency_city: 'Kab. Bandung', latitude: '-6.9175000', longitude: '107.6191000',
    status: 'AKTIF', handling_scale: 'PROVINSI', occurred_at: '2026-11-21T00:00:00Z', created_by: user.id,
  });
  assert.equal(disaster.created_by, actor.id);

  // An item writes its opening stock as STOK_AWAL (AB-02).
  const item = await create('inventory-items', { name: 'Beras', category: 'PANGAN', stock_unit: 'kg', initial_stock: '10' });
  assert.equal(Number(item.initial_stock), 10);
  assert.equal(await stockOf(item.id), 10);

  // A shipment, its items and the PENGIRIMAN movement are one write (AB-03.1).
  const shipment = await create('shipments', {
    disaster_id: disaster.id, shipped_at: '2026-11-21T00:00:00Z', destination: 'Bandung', person_in_charge: 'Test',
    request_key: randomUUID(), items: [{ item_id: item.id, quantity: 1 }],
  });
  assert.equal(shipment.status, 'DIKIRIM');
  assert.equal(shipment.items.length, 1);
  assert.equal(await stockOf(item.id), 9);
  created['shipment-items'] = await json(await request(`shipment-items/${shipment.items[0].id}`));
  payloads['shipment-items'] = { shipment_id: shipment.id };

  // A receipt writes PENERIMAAN (UC-08).
  const receipt = await create('stock-receipts', {
    item_id: item.id, quantity: '2', receipt_date: '2026-11-21', source_giver: 'Donor', item_condition: 'Baik', request_key: randomUUID(),
  });
  assert.equal(receipt.receipt_date, '2026-11-21');
  assert.equal(await stockOf(item.id), 11);
  const movements = await (await request(`stock-movements?receipt_id=${receipt.id}`)).json();
  created['stock-movements'] = movements.data[0];
  payloads['stock-movements'] = { item_id: item.id };
  assert.equal(created['stock-movements'].movement_type, 'PENERIMAAN');

  // Reports take their author from the token and write GENERATE_LAPORAN.
  const snapshot = { disaster_id: disaster.id, items: [{ item_id: item.id, quantity: '1' }] };
  const report = await create('generated-reports', { disaster_id: disaster.id, report_snapshot: snapshot });
  assert.deepEqual(report.report_snapshot, snapshot);
  assert.deepEqual([report.generated_by, report.generated_by_name], [actor.id, actor.name]);
  const audits = await (await request(`audit-logs?action=GENERATE_LAPORAN&entity_id=${disaster.id}`)).json();
  assert.equal(audits.data.length, 1);
  created['audit-logs'] = audits.data[0];
  payloads['audit-logs'] = { user_id: actor.id };

  for (const resource of modules) {
    const path = resource.path;
    const row = created[path];
    const detail = await request(`${path}/${row.id}`);
    assert.equal(detail.status, 200, path);
    assert.deepEqual(await json(detail), row);
    const filter = resource.filters[0];
    const list = await request(`${path}?${filter}=${encodeURIComponent(payloads[path][filter])}&limit=100`);
    assert.equal(list.status, 200, path);
    const page = await list.json();
    assert.ok(page.data.some((entry) => entry.id === row.id), path);
    assert.ok(page.data.every((entry) => String(entry[filter]) === String(payloads[path][filter])), path);
    assert.equal((await request(`${path}?limit=101`)).status, 422);
    assert.equal((await request(`${path}?unknown=1`)).status, 422);
    assert.equal((await request(`${path}/2147483648`)).status, 422);
    assert.equal((await request(`${path}/2147483647`)).status, 404);
    if (resource.readOnly) {
      assert.equal((await request(path, 'POST', {})).status, 404, path);
    } else {
      assert.equal((await request(path, 'POST', { ...payloads[path], unknown: true })).status, 422, path);
    }
    if (resource.appendOnly || resource.readOnly) {
      assert.equal((await request(`${path}/${row.id}`, 'PATCH', {})).status, 404);
      assert.equal((await request(`${path}/${row.id}`, 'DELETE')).status, 404);
    }
    // Transparency: reads work without a token, except accounts.
    assert.equal((await request(`${path}/${row.id}`, 'GET', undefined, null)).status, path === 'users' ? 401 : 200, `public ${path}`);
  }

  const expectError = async (path, method, body, expected) => {
    await client.query('SAVEPOINT api_constraint');
    const response = await request(path, method, body);
    assert.equal(response.status, expected, `${method} ${path}: ${await response.text()}`);
    await client.query('ROLLBACK TO SAVEPOINT api_constraint');
  };
  await expectError('users', 'POST', payloads.users, 409);
  await expectError(`users/${actor.id}`, 'DELETE', undefined, 422);
  await expectError('shipments', 'POST', { ...payloads.shipments, request_key: randomUUID(), disaster_id: 2147483647 }, 422);
  await expectError('shipments', 'POST', { ...payloads.shipments, request_key: randomUUID(), items: [{ item_id: item.id, quantity: 1000 }] }, 422);
  await expectError(`shipments/${shipment.id}`, 'PATCH', { received_at: '2026-11-21T12:00:00Z' }, 422);
  await expectError('shipments', 'POST', payloads.shipments, 409);
  // A petugas cannot manage accounts.
  const petugasToken = tokenFor(user.id);
  assert.equal((await request('users', 'POST', { ...payloads.users, username: `x-${randomUUID()}` }, petugasToken)).status, 403);

  const changes = {
    users: { name: 'Updated user', password: 'updated-test-password' }, disasters: { affected_people: 10 },
    'inventory-items': { name: 'Updated rice' }, shipments: { destination: 'Posko baru' }, 'stock-receipts': { notes: 'Updated receipt' },
  };
  for (const [path, body] of Object.entries(changes)) {
    const response = await request(`${path}/${created[path].id}`, 'PATCH', body);
    assert.equal(response.status, 200, path);
    const updated = await json(response);
    assert.equal(updated.password_hash, undefined);
    for (const [key, value] of Object.entries(body)) {
      if (key === 'password') continue;
      assert.equal(updated[key], value, `${path}.${key}`);
    }
    const trail = await (await request(`audit-logs?action=UBAH&entity_id=${created[path].id}`)).json();
    assert.ok(trail.data.some((entry) => entry.entity_type === path.replace('-', '_')), `audit ${path}`);
  }
  assert.notEqual((await client.query('SELECT password_hash FROM users WHERE id = $1', [user.id])).rows[0].password_hash, hash);

  // Receipt confirmation stores received_at only; stock stays (AB-03.3).
  const received = await request(`shipments/${shipment.id}`, 'PATCH', { status: 'DITERIMA', received_at: '2026-11-22T00:00:00Z' });
  assert.equal(received.status, 200);
  assert.equal(await stockOf(item.id), 11);

  // Deleting returns stock (KF-09.3) and keeps the unique key.
  for (const path of ['shipments', 'stock-receipts']) {
    const id = created[path].id;
    assert.equal((await request(`${path}/${id}`, 'DELETE')).status, 204);
    assert.equal((await request(`${path}/${id}`)).status, 404);
    assert.equal((await request(`${path}/${id}`, 'DELETE')).status, 404);
    await expectError(path, 'POST', payloads[path], 409);
  }
  assert.equal(await stockOf(item.id), 10);

  // Disasters and items are soft-deleted; their history stays (AC-18).
  for (const path of ['disasters', 'inventory-items']) {
    const id = created[path].id;
    assert.equal((await request(`${path}/${id}`, 'DELETE')).status, 204);
    assert.equal((await request(`${path}/${id}`)).status, 404);
    const row = (await client.query(`SELECT deleted_at FROM ${path.replace('-', '_')} WHERE id = $1`, [id])).rows[0];
    assert.ok(row.deleted_at);
  }
  assert.equal(await stockOf(item.id), 10);
});
