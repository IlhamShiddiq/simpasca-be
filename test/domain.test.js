import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { checkLines, createService as createShipments } from '../src/shipments/service.js';
import { createService as createReceipts } from '../src/stock-receipts/service.js';
import { createService as createItems } from '../src/inventory-items/service.js';
import { createService as createUsers } from '../src/users/service.js';
import { createService as createAudit } from '../src/audit-logs/service.js';
import { createService as createCash } from '../src/cash-transactions/service.js';
import { authOptions, tokenFor } from './helpers/auth.js';

const petugas = { id: 3, name: 'Rina', username: 'rina', role: 'PETUGAS' };
const beras = { id: 7, name: 'Beras', category: 'PANGAN', stock_unit: 'kg', expiration_date: '2099-01-01' };
const mie = { id: 8, name: 'Mie instan', category: 'PANGAN', stock_unit: 'dus', expiration_date: '2020-01-01' };

/** Fake repository: records writes, runs the transaction callback with itself. */
function fakeRepository(overrides = {}) {
  const calls = [];
  const record = (name, result) => async (...args) => { calls.push([name, ...args]); return typeof result === 'function' ? result(...args) : result; };
  const repository = {
    transaction: (fn) => fn(repository),
    lockItems: async (ids) => new Map([beras, mie].filter((item) => ids.includes(item.id)).map((item) => [item.id, item])),
    stockLevels: async (ids) => new Map(ids.map((id) => [id, 100])),
    liveDisaster: async () => ({ id: 1 }),
    liveItems: async () => [],
    addMovement: record('movement'),
    audit: record('audit'),
    create: record('create', (data) => ({ id: 42, ...data })),
    upsertItem: record('upsertItem', (shipmentId, itemId, quantity) => ({ id: 900 + itemId, item_id: itemId, quantity: String(quantity) })),
    removeItem: record('removeItem'),
    update: record('update', (id, data) => ({ id, ...data })),
    remove: record('remove', (id) => ({ id })),
    ...overrides,
  };
  return { repository, calls, kinds: () => calls.map(([name, arg]) => (name === 'movement' ? `movement:${arg.type}:${arg.delta}` : name)) };
}

const shipmentBody = (items) => ({
  disaster_id: 1, shipped_at: '2026-11-20T00:00:00+07:00', destination: 'Posko', person_in_charge: 'Budi',
  request_key: 'k-1', created_by: 999, items,
});

test('AB-03.2/AC-14: one bad line rejects the whole shipment, listing every problem', () => {
  const items = new Map([[7, beras], [8, mie]]);
  const stock = new Map([[7, 50], [8, 10]]);
  assert.throws(
    () => checkLines([{ item_id: 7, quantity: 60 }, { item_id: 8, quantity: 1 }, { item_id: 99, quantity: 1 }], items, stock, new Map(), '2026-11-20'),
    (error) => error.status === 422 && /Beras melebihi stok tersedia \(50 kg\)/.test(error.message)
      && /Mie instan sudah kedaluwarsa/.test(error.message) && /Barang 99 tidak ditemukan/.test(error.message),
  );
  // Quantity already on this shipment counts as available; unchanged lines are not re-checked.
  checkLines([{ item_id: 7, quantity: 60 }, { item_id: 8, quantity: 5 }], items, stock, new Map([[7, 10], [8, 5]]), '2026-11-20');
});

test('AB-03.1/AB-02: a shipment, its items and PENGIRIMAN movements are one transaction; created_by comes from the token', async () => {
  const { repository, calls, kinds } = fakeRepository();
  const shipment = await createShipments(repository).create(shipmentBody([{ item_id: 7, quantity: 30 }]), petugas);
  assert.deepEqual(kinds(), ['create', 'upsertItem', 'movement:PENGIRIMAN:-30']);
  const created = calls[0][1];
  assert.deepEqual([created.created_by, created.status, created.received_at], [3, 'DIKIRIM', null]);
  assert.equal(calls[2][1].shipmentItemId, 907);
  assert.equal(calls[2][1].date, '2026-11-20');
  assert.equal(shipment.items.length, 0); // liveItems of this fake is empty
  await assert.rejects(createShipments(repository).create(shipmentBody([{ item_id: 7, quantity: 1 }]), null), { status: 401 });
  await assert.rejects(createShipments(repository).create({ ...shipmentBody([{ item_id: 7, quantity: 1 }]), status: 'DITERIMA' }, petugas), { status: 422 });
});

test('KF-09.3: editing lines writes KOREKSI for changes and removals; receipt confirmation never touches stock', async () => {
  const before = { id: 42, disaster_id: 1, status: 'DIKIRIM', shipped_at: '2026-11-20T00:00:00+07:00', received_at: null };
  const current = [{ id: 907, item_id: 7, quantity: '30' }, { id: 908, item_id: 8, quantity: '5' }];
  const { repository, kinds } = fakeRepository({ find: async () => before, liveItems: async () => current });
  await createShipments(repository).update('42', { items: [{ item_id: 7, quantity: 20 }] }, petugas);
  assert.deepEqual(kinds(), ['movement:KOREKSI:5', 'removeItem', 'upsertItem', 'movement:KOREKSI:10', 'audit']);

  const confirm = fakeRepository({ find: async () => before, liveItems: async () => current });
  await createShipments(confirm.repository).update('42', { status: 'DITERIMA', received_at: '2026-11-21T09:00:00+07:00' }, petugas);
  assert.deepEqual(confirm.kinds(), ['update', 'audit']);
  await assert.rejects(createShipments(confirm.repository).update('42', { status: 'DITERIMA' }, petugas), { status: 422 });
  await assert.rejects(createShipments(confirm.repository).update('42', { status: 'DITERIMA', received_at: '2026-11-19T09:00:00+07:00' }, petugas), { status: 422 });
});

test('UC-07/UC-08: items write STOK_AWAL, receipts PENERIMAAN; corrections never make stock negative', async () => {
  const items = fakeRepository();
  await createItems(items.repository).create({ name: 'Beras', category: 'PANGAN', stock_unit: 'kg', initial_stock: '500', created_by: 1 }, petugas);
  assert.deepEqual(items.kinds(), ['create', 'movement:STOK_AWAL:500']);
  assert.equal(items.calls[0][1].created_by, 3);

  const receipt = { id: 4, item_id: 7, quantity: '100', source_giver: 'Donasi warga', receipt_date: '2026-11-20' };
  const shipped = fakeRepository({ find: async () => receipt, stockLevels: async () => new Map([[7, 40]]) });
  await assert.rejects(createReceipts(shipped.repository).remove('4', petugas), { status: 422 });
  assert.deepEqual(shipped.kinds(), []);

  const ok = fakeRepository({ find: async () => receipt, stockLevels: async () => new Map([[7, 150]]) });
  await createReceipts(ok.repository).remove('4', petugas);
  assert.deepEqual(ok.kinds(), ['movement:KOREKSI:-100', 'remove', 'audit']);
});

test('KF-01.4: only SUPERADMIN manages accounts, and nobody removes or demotes themselves', async (t) => {
  const users = { 3: petugas, 1: { id: 1, name: 'Admin', username: 'admin', role: 'SUPERADMIN' } };
  const db = {
    query: async (sql, values) => sql.startsWith('SELECT id, name, username, role FROM users WHERE id = $1')
      ? { rows: [users[values[0]]].filter(Boolean) } : { rows: [], rowCount: 0 },
  };
  const server = createApp(db, { auth: authOptions }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/users`;
  const as = (id) => ({ Authorization: `Bearer ${tokenFor(id)}`, 'Content-Type': 'application/json' });
  const body = JSON.stringify({ name: 'Baru', username: 'baru', password: 'sandi-rahasia-1', role: 'PETUGAS' });
  assert.equal((await fetch(base, { method: 'POST', headers: as(3), body })).status, 403);
  assert.equal((await fetch(`${base}/1`, { method: 'DELETE', headers: as(3) })).status, 403);

  const service = createUsers(fakeRepository({ find: async (id) => users[id] }).repository);
  await assert.rejects(service.remove('1', users[1]), { status: 422 });
  await assert.rejects(service.update('1', { role: 'PETUGAS' }, users[1]), { status: 422 });
  await assert.rejects(service.create({ name: 'X', username: 'x', password: 'sandi-rahasia-1', role: 'admin' }), { status: 422 });
});

test('visitors read the audit trail without entries about accounts', async () => {
  let filters;
  const service = createAudit({
    list: async (query) => { filters = query; return { data: [], total: 0 }; },
    find: async () => ({ id: 5, entity_type: 'users' }),
  });
  await service.list({}, null);
  assert.equal(filters.hideUsers, true);
  await service.list({}, petugas);
  assert.equal(filters.hideUsers, false);
  await assert.rejects(service.find('5', null), { status: 404 });
  assert.equal((await service.find('5', petugas)).id, 5);
});

test('cash links must be live and a receipt link needs an expense', async () => {
  const created = [];
  const service = createCash({
    liveDisaster: async (id) => (id === 1 ? { id } : undefined),
    liveReceipt: async (id) => (id === 2 ? { id } : undefined),
    create: async (data) => { created.push(data); return data; },
  });
  const actor = { id: 9, role: 'PETUGAS' };
  const base = { type: 'expense', amount: '10', transaction_date: '2026-11-14', request_key: 'k' };
  assert.equal((await service.create({ ...base, disaster_id: 1, receipt_id: 2 }, actor)).disaster_id, 1);
  await assert.rejects(service.create({ ...base, type: 'income', receipt_id: 2 }, actor), { status: 422 });
  await assert.rejects(service.create({ ...base, disaster_id: 5 }, actor), { status: 422 });
  await assert.rejects(service.create({ ...base, receipt_id: 5 }, actor), { status: 422 });
  assert.equal(created.length, 1);
});
