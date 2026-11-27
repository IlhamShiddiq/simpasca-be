import { domainTools } from '../shared/domain.js';

const columns = 'id, disaster_id, status, shipped_at, received_at, destination, person_in_charge, request_key, created_by, created_at, updated_at, deleted_at';
const itemColumns = 'id, item_id, quantity::text';

function filters(query) {
  const conditions = ['deleted_at IS NULL'];
  const values = [];
  for (const key of ['disaster_id', 'status', 'created_by']) {
    if (query[key] !== undefined) {
      values.push(query[key]);
      conditions.push(`${key} = $${values.length}`);
    }
  }
  return { where: conditions.join(' AND '), values };
}

export function createRepository(db) {
  return {
    ...domainTools(db, createRepository),
    async list(query) {
      const { where, values } = filters(query);
      const result = await db.query(
        `WITH filtered AS (SELECT ${columns} FROM shipments WHERE ${where})
         SELECT (SELECT COUNT(*)::integer FROM filtered) AS total,
           COALESCE((SELECT json_agg(page_rows) FROM (
             SELECT * FROM filtered ORDER BY id DESC
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}
           ) page_rows), '[]'::json) AS data`,
        [...values, query.limit, (query.page - 1) * query.limit],
      );
      return result.rows[0];
    },
    async find(id) {
      const result = await db.query(`SELECT ${columns} FROM shipments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
      return result.rows[0];
    },
    async create(data) {
      const result = await db.query(
        `INSERT INTO shipments (disaster_id, status, shipped_at, received_at, destination, person_in_charge, request_key, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${columns}`,
        [data.disaster_id, data.status, data.shipped_at ?? null, data.received_at ?? null, data.destination, data.person_in_charge, data.request_key, data.created_by],
      );
      return result.rows[0];
    },
    async update(id, data) {
      const keys = Object.keys(data);
      const assignments = keys.map((key, index) => `${key} = $${index + 1}`);
      const result = await db.query(
        `UPDATE shipments SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE id = $${keys.length + 1} AND deleted_at IS NULL RETURNING ${columns}`,
        [...keys.map((key) => data[key]), id],
      );
      return result.rows[0];
    },
    async remove(id) {
      const result = await db.query(
        'UPDATE shipments SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [id],
      );
      return result.rows[0];
    },
    async liveDisaster(id) {
      return (await db.query('SELECT id FROM disasters WHERE id = $1 AND deleted_at IS NULL', [id])).rows[0];
    },
    async liveItems(shipmentId) {
      const result = await db.query(
        `SELECT ${itemColumns} FROM shipment_items WHERE shipment_id = $1 AND deleted_at IS NULL ORDER BY id`, [shipmentId],
      );
      return result.rows;
    },
    /** One row per (shipment, item) exists for life (UNIQUE), so a line removed earlier is revived. */
    async upsertItem(shipmentId, itemId, quantity) {
      const result = await db.query(
        `INSERT INTO shipment_items (shipment_id, item_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (shipment_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity, deleted_at = NULL
         RETURNING ${itemColumns}`,
        [shipmentId, itemId, String(quantity)],
      );
      return result.rows[0];
    },
    async removeItem(id) {
      await db.query('UPDATE shipment_items SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [id]);
    },
  };
}
