import { HttpError } from '../errors.js';
import { createRepository as createAuditRepository } from '../audit-logs/repository.js';
import { createRepository as createMovementRepository } from '../stock-movements/repository.js';
import { withTransaction } from './transaction.js';

/**
 * Helpers every writing repository shares: one transaction per request, item
 * locks with derived stock (SUM(in) - SUM(out), AB-02), movements and audit rows.
 * Spread into a repository: `{ ...domainTools(db, createRepository), ... }`.
 */
export function domainTools(db, createRepository) {
  const movements = createMovementRepository(db);
  const audits = createAuditRepository(db);
  return {
    transaction: (fn) => withTransaction(db, (tx) => fn(createRepository(tx))),
    /** Live items, locked until the transaction ends so concurrent writes see the same stock. */
    async lockItems(ids) {
      if (ids.length === 0) return new Map();
      const result = await db.query(
        `SELECT id, name, category, stock_unit, expiration_date::text AS expiration_date
         FROM inventory_items WHERE id = ANY($1::int[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
        [ids],
      );
      return new Map(result.rows.map((row) => [row.id, row]));
    },
    async stockLevels(ids) {
      const result = await db.query(
        `SELECT item_id, COALESCE(SUM(quantity_in - quantity_out), 0)::text AS stock
         FROM stock_movements WHERE item_id = ANY($1::int[]) GROUP BY item_id`,
        [ids],
      );
      return new Map(ids.map((id) => [id, Number(result.rows.find((row) => row.item_id === id)?.stock ?? 0)]));
    },
    /** delta > 0 adds stock, < 0 takes it out. Zero writes nothing (the table rejects it). */
    async addMovement({ itemId, type, delta, date, notes, userId, disasterId = null, receiptId = null, shipmentItemId = null }) {
      if (delta === 0) return undefined;
      return movements.create({
        item_id: itemId, disaster_id: disasterId, receipt_id: receiptId, shipment_item_id: shipmentItemId,
        movement_type: type, quantity_in: String(Math.max(0, delta)), quantity_out: String(Math.max(0, -delta)),
        movement_date: date, notes, created_by: userId,
      });
    },
    async audit({ userId, action, entityType, entityId, before = null, after = null }) {
      return audits.create({
        user_id: userId, action, entity_type: entityType, entity_id: entityId, before_data: before, after_data: after,
      });
    },
  };
}

export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

/** Stock may never go below zero (AB-02.3). */
export function assertStock(stock, delta, item) {
  if (stock + delta < 0) {
    throw new HttpError(422, `Stok ${item.name} tidak mencukupi: tersedia ${stock} ${item.stock_unit}, dibutuhkan ${-delta}.`);
  }
}

/** The signed-in user; writes are never anonymous. */
export function actorOf(actor) {
  if (!actor) throw new HttpError(401, 'Bearer token wajib untuk mengubah data.');
  return actor;
}

/** created_by and similar fields come from the token, never from the client. */
export function withoutClientFields(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  return Object.fromEntries(Object.entries(body).filter(([key]) => !fields.includes(key)));
}
