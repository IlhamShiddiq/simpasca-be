const columns = 'id, item_id, quantity::text, receipt_date::text, source_giver, item_condition, notes, request_key, created_by, created_at, updated_at, deleted_at';

function filters(query) {
  const conditions = ['deleted_at IS NULL'];
  const values = [];
  for (const key of ['item_id', 'item_condition', 'created_by']) {
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
        `WITH filtered AS (SELECT ${columns} FROM stock_receipts WHERE ${where})
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
      const result = await db.query(`SELECT ${columns} FROM stock_receipts WHERE id = $1 AND deleted_at IS NULL`, [id]);
      return result.rows[0];
    },
    async create(data) {
      const result = await db.query(
        `INSERT INTO stock_receipts (item_id, quantity, receipt_date, source_giver, item_condition, notes, request_key, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${columns}`,
        [data.item_id, data.quantity, data.receipt_date, data.source_giver, data.item_condition, data.notes ?? null, data.request_key, data.created_by],
      );
      return result.rows[0];
    },
    async update(id, data) {
      const keys = Object.keys(data);
      const assignments = keys.map((key, index) => `${key} = $${index + 1}`);
      const result = await db.query(
        `UPDATE stock_receipts SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE id = $${keys.length + 1} AND deleted_at IS NULL RETURNING ${columns}`,
        [...keys.map((key) => data[key]), id],
      );
      return result.rows[0];
    },
    async remove(id) {
      const result = await db.query(
        'UPDATE stock_receipts SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [id],
      );
      return result.rows[0];
    },
  };
}
