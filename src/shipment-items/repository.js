const columns = 'id, shipment_id, item_id, quantity::text, deleted_at';

function filters(query) {
  const conditions = ['deleted_at IS NULL'];
  const values = [];
  for (const key of ['shipment_id', 'item_id']) {
    if (query[key] !== undefined) {
      values.push(query[key]);
      conditions.push(`${key} = $${values.length}`);
    }
  }
  return { where: conditions.join(' AND '), values };
}

export function createRepository(db) {
  return {
    async list(query) {
      const { where, values } = filters(query);
      const result = await db.query(
        `WITH filtered AS (SELECT ${columns} FROM shipment_items WHERE ${where})
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
      const result = await db.query(`SELECT ${columns} FROM shipment_items WHERE id = $1 AND deleted_at IS NULL`, [id]);
      return result.rows[0];
    },
    async create(data) {
      const result = await db.query(
        `INSERT INTO shipment_items (shipment_id, item_id, quantity)
         VALUES ($1, $2, $3) RETURNING ${columns}`,
        [data.shipment_id, data.item_id, data.quantity],
      );
      return result.rows[0];
    },
    async update(id, data) {
      const keys = Object.keys(data);
      const assignments = keys.map((key, index) => `${key} = $${index + 1}`);
      const result = await db.query(
        `UPDATE shipment_items SET ${assignments.join(', ')}
         WHERE id = $${keys.length + 1} AND deleted_at IS NULL RETURNING ${columns}`,
        [...keys.map((key) => data[key]), id],
      );
      return result.rows[0];
    },
    async remove(id) {
      const result = await db.query(
        'UPDATE shipment_items SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [id],
      );
      return result.rows[0];
    },
  };
}
