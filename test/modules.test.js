import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { modules } from './helpers/modules.js';
import * as users from '../src/users/validation.js';
import * as disasters from '../src/disasters/validation.js';
import * as inventory from '../src/inventory-items/validation.js';
import * as shipments from '../src/shipments/validation.js';
import * as movements from '../src/stock-movements/validation.js';
import * as reports from '../src/generated-reports/validation.js';
import { createService } from '../src/users/service.js';

test('resource validation rejects unknown, immutable, invalid and oversized input', () => {
  for (const body of [null, [], {}, { name: 'Test', username: 'test', password: 'short', role: 'admin' },
    { name: 'Test', username: 'test', password_hash: 'raw', role: 'admin' }]) {
    assert.throws(() => users.validateBody(body), { status: 422 });
  }
  assert.throws(() => users.validateBody({}, true), { status: 422 });
  assert.throws(() => users.validateBody({ role: 'a'.repeat(51) }, true), { status: 422 });
  assert.throws(() => shipments.validateBody({ request_key: 'changed' }, true), { status: 422 });
  for (const value of ['0', '-1', '2147483648', '1 OR 1=1', [], null]) {
    assert.throws(() => users.positiveId(value), { status: 422 });
  }
  for (const query of [{ unknown: '1' }, { page: ['1', '2'] }, { limit: '101' }, { created_by: '2147483648' }]) {
    assert.throws(() => disasters.validateQuery(query), { status: 422 });
  }
  assert.deepEqual(shipments.validateQuery({ disaster_id: '2', status: 'draft' }), {
    page: 1, limit: 20, disaster_id: 2, status: 'draft',
  });
});

test('each API module owns routes, controller, service, repository and validation', async () => {
  for (const module of modules) {
    const directory = new URL(`../src/${module.path}/`, import.meta.url);
    const [routes, controller, service, repository, validation] = await Promise.all(
      ['routes.js', 'controller.js', 'service.js', 'repository.js', 'validation.js']
        .map((file) => readFile(new URL(file, directory), 'utf8')),
    );
    assert.match(routes, /createController\(createService\(createRepository\(db\)\)\)/);
    assert.match(controller, /export function createController\(service\)/);
    assert.match(service, /export function createService\(repository\)/);
    assert.match(repository, new RegExp(`INSERT INTO ${module.path.replaceAll('-', '_')} \\(`));
    assert.match(validation, /export function validateBody\(body, partial = false\)/);
    assert.match(validation, /export function validateQuery\(query\)/);
    assert.equal(routes.includes('controller.update'), !module.appendOnly && !module.readOnly);
    assert.equal(routes.includes('router.post'), !module.readOnly);
  }
});

test('resource validation preserves decimals and validates dates, coordinates and JSON', () => {
  // Stock is counted in whole units (AB-02.2, AC-13).
  assert.deepEqual(inventory.validateBody({ initial_stock: '10', need_ratio: null }, true), { initial_stock: '10', need_ratio: null });
  for (const body of [{ initial_stock: '1.0001' }, { initial_stock: '10.5' }, { initial_stock: '-1' }, { need_ratio: '0' },
    { expiration_date: '2026-02-30' }, { expiration_date: '0000-01-01' }]) {
    assert.throws(() => inventory.validateBody(body, true), { status: 422 });
  }
  assert.throws(() => disasters.validateBody({ latitude: '90.0000001' }, true), { status: 422 });
  assert.throws(() => disasters.validateBody({ occurred_at: '2026-11-21' }, true), { status: 422 });
  assert.throws(() => disasters.validateBody({ occurred_at: '2026-02-30T12:00:00Z' }, true), { status: 422 });
  assert.deepEqual(disasters.validateBody({ occurred_at: '2026-11-21T12:00:00+07:00' }, true), { occurred_at: '2026-11-21T12:00:00+07:00' });
  assert.throws(() => reports.validateBody({ report_snapshot: [] }, true), { status: 422 });
});

test('stock movement validation requires exactly one positive direction and at most one source', () => {
  const base = { item_id: 1, movement_type: 'receipt', movement_date: '2026-11-21', created_by: 1 };
  for (const extra of [{}, { quantity_in: '0' }, { quantity_in: '1', quantity_out: '1' },
    { quantity_in: '1', receipt_id: 1, shipment_item_id: 2 }]) {
    assert.throws(() => movements.validateBody({ ...base, ...extra }), { status: 422 });
  }
  assert.equal(movements.validateBody({ ...base, quantity_in: '1.125' }).quantity_in, '1.125');
});

test('user service hashes passwords and never passes plaintext to repository', async () => {
  let captured;
  const service = createService({ create: async (data) => { captured = data; return { id: 1, username: data.username }; } });
  await service.create({ name: 'Test', username: 'test', password: 'a-secure-password', role: 'PETUGAS' });
  assert.equal(captured.password, undefined);
  assert.match(captured.password_hash, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
});