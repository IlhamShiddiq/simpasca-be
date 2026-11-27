import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/db.js';

test('PostgreSQL: complete ERD migrations, relations and constraints', async (t) => {
  const client = await pool.connect();
  t.after(async () => {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  });
  await client.query('BEGIN');
  // Isolate DDL and fixtures from the application's existing tables.
  const schema = `test_erd_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  const directory = new URL('../../migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await readFile(new URL(file, directory), 'utf8'));
  }

  const tables = (await client.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name', [schema],
  )).rows.map((row) => row.table_name);
  assert.deepEqual(tables, [
    'audit_logs', 'auth_revoked_tokens', 'cash_transactions', 'disasters', 'generated_reports', 'inventory_items',
    'shipment_items', 'shipments', 'stock_movements', 'stock_receipts', 'users',
  ]);

  const insert = async (sql, values = []) => (await client.query(`${sql} RETURNING *`, values)).rows[0];
  const user = await insert("INSERT INTO users (name, username, password_hash, role) VALUES ('Test', 'test', 'test-only', 'SUPERADMIN')");
  const disaster = await insert(`INSERT INTO disasters
    (disaster_type, province, regency_city, status, handling_scale, occurred_at, created_by)
    VALUES ('flood', 'Jawa Barat', 'Bandung', 'active', 'city', NOW(), $1)`, [user.id]);
  const item = await insert(`INSERT INTO inventory_items (name, category, stock_unit, initial_stock, need_ratio, created_by)
    VALUES ('Rice', 'food', 'kg', 10.125, 0.500000, $1)`, [user.id]);
  assert.equal(item.initial_stock, '10.125');
  assert.equal(item.need_ratio, '0.500000');
  const shipment = await insert(`INSERT INTO shipments
    (disaster_id, status, destination, person_in_charge, request_key, created_by)
    VALUES ($1, 'draft', 'Bandung', 'Test', 'shipment-1', $2)`, [disaster.id, user.id]);
  const shipmentItem = await insert(`INSERT INTO shipment_items (shipment_id, item_id, quantity)
    VALUES ($1, $2, 1.125)`, [shipment.id, item.id]);
  const receipt = await insert(`INSERT INTO stock_receipts
    (item_id, quantity, receipt_date, source_giver, item_condition, request_key, created_by)
    VALUES ($1, 2.125, CURRENT_DATE, 'Donor', 'good', 'receipt-1', $2)`, [item.id, user.id]);
  const movement = await insert(`INSERT INTO stock_movements
    (item_id, receipt_id, movement_type, quantity_in, movement_date, created_by)
    VALUES ($1, $2, 'receipt', 2.125, CURRENT_DATE, $3)`, [item.id, receipt.id, user.id]);
  assert.equal(movement.quantity_in, '2.125');
  await insert(`INSERT INTO stock_movements
    (item_id, disaster_id, shipment_item_id, movement_type, quantity_out, movement_date, created_by)
    VALUES ($1, $2, $3, 'shipment', 1.125, CURRENT_DATE, $4)`, [item.id, disaster.id, shipmentItem.id, user.id]);
  const snapshot = { disaster: disaster.id, items: [{ name: item.name, quantity: '1.125' }] };
  const report = await insert(`INSERT INTO generated_reports
    (disaster_id, report_snapshot, generated_by, generated_by_name) VALUES ($1, $2, $3, $4)`,
  [disaster.id, JSON.stringify(snapshot), user.id, user.name]);
  assert.deepEqual(report.report_snapshot, snapshot);
  const audit = await insert(`INSERT INTO audit_logs
    (user_id, action, entity_type, entity_id, after_data) VALUES ($1, 'create', 'shipments', $2, $3)`,
  [user.id, shipment.id, JSON.stringify({ status: shipment.status })]);
  assert.equal(audit.before_data, null);
  assert.deepEqual(audit.after_data, { status: 'draft' });

  const rejects = async (sql, values, code) => {
    await client.query('SAVEPOINT constraint_check');
    await assert.rejects(client.query(sql, values), (error) => error.code === code);
    await client.query('ROLLBACK TO SAVEPOINT constraint_check');
  };
  await rejects("UPDATE users SET role = 'operator' WHERE id = $1", [user.id], '23514');
  await rejects('UPDATE shipments SET disaster_id = -1 WHERE id = $1', [shipment.id], '23503');
  await rejects('DELETE FROM users WHERE id = $1', [user.id], '23503');
  await rejects('DELETE FROM inventory_items WHERE id = $1', [item.id], '23503');
  await rejects('DELETE FROM shipments WHERE id = $1', [shipment.id], '23503');
  await rejects('DELETE FROM stock_receipts WHERE id = $1', [receipt.id], '23503');
  await rejects('DELETE FROM shipment_items WHERE id = $1', [shipmentItem.id], '23503');
  await rejects('UPDATE disasters SET latitude = 91 WHERE id = $1', [disaster.id], '23514');
  await rejects('UPDATE disasters SET affected_people = -1 WHERE id = $1', [disaster.id], '23514');
  await rejects('UPDATE inventory_items SET initial_stock = -1 WHERE id = $1', [item.id], '23514');
  await rejects('UPDATE shipment_items SET quantity = 0 WHERE id = $1', [shipmentItem.id], '23514');
  await rejects('UPDATE stock_receipts SET quantity = -1 WHERE id = $1', [receipt.id], '23514');
  await rejects('UPDATE stock_movements SET quantity_out = 1 WHERE id = $1', [movement.id], '23514');
  await rejects('UPDATE stock_movements SET shipment_item_id = $1 WHERE id = $2', [shipmentItem.id, movement.id], '23514');
  await rejects('UPDATE shipments SET received_at = NOW() WHERE id = $1', [shipment.id], '23514');

  // Soft deletion must not free globally unique request keys or item pairs.
  await client.query('UPDATE shipments SET deleted_at = NOW() WHERE id = $1', [shipment.id]);
  await rejects(`INSERT INTO shipments (disaster_id, status, destination, person_in_charge, request_key, created_by)
    VALUES ($1, 'draft', 'Bandung', 'Test', 'shipment-1', $2)`, [disaster.id, user.id], '23505');
  await client.query('UPDATE stock_receipts SET deleted_at = NOW() WHERE id = $1', [receipt.id]);
  await rejects(`INSERT INTO stock_receipts
    (item_id, quantity, receipt_date, source_giver, item_condition, request_key, created_by)
    VALUES ($1, 1, CURRENT_DATE, 'Donor', 'good', 'receipt-1', $2)`, [item.id, user.id], '23505');
  await client.query('UPDATE shipment_items SET deleted_at = NOW() WHERE id = $1', [shipmentItem.id]);
  await rejects('INSERT INTO shipment_items (shipment_id, item_id, quantity) VALUES ($1, $2, 1)',
    [shipment.id, item.id], '23505');
});