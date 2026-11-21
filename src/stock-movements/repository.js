const columns = 'id, item_id, disaster_id, receipt_id, shipment_item_id, movement_type, quantity_in::text, quantity_out::text, movement_date::text, notes, created_by, created_at';

function filters(query) {
  const conditions = ['TRUE'];
  const values = [];
  for (const key of ['item_id', 'disaster_id', 'receipt_id', 'shipment_item_id', 'movement_type', 'created_by']) {
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
        `WITH filtered AS (SELECT ${columns} FROM stock_movements WHERE ${where})
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
      const result = await db.query(`SELECT ${columns} FROM stock_movements WHERE id = $1`, [id]);
      return result.rows[0];
    },
    async create(data) {
      const result = await db.query(
        `INSERT INTO stock_movements (item_id, disaster_id, receipt_id, shipment_item_id, movement_type, quantity_in, quantity_out, movement_date, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${columns}`,
        [data.item_id, data.disaster_id ?? null, data.receipt_id ?? null, data.shipment_item_id ?? null, data.movement_type, data.quantity_in ?? 0, data.quantity_out ?? 0, data.movement_date, data.notes ?? null, data.created_by],
      );
      return result.rows[0];
    },
  };
}
