const columns = 'id, name, category, stock_unit, initial_stock::text, need_ratio::text, need_type, ratio_basis, expiration_date::text, created_by';

function filters(query) {
  const conditions = ['TRUE'];
  const values = [];
  for (const key of ['category', 'stock_unit', 'need_type', 'created_by']) {
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
        `WITH filtered AS (SELECT ${columns} FROM inventory_items WHERE ${where})
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
      const result = await db.query(`SELECT ${columns} FROM inventory_items WHERE id = $1`, [id]);
      return result.rows[0];
    },
    async create(data) {
      const result = await db.query(
        `INSERT INTO inventory_items (name, category, stock_unit, initial_stock, need_ratio, need_type, ratio_basis, expiration_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${columns}`,
        [data.name, data.category, data.stock_unit, data.initial_stock ?? 0, data.need_ratio ?? null, data.need_type ?? null, data.ratio_basis ?? null, data.expiration_date ?? null, data.created_by],
      );
      return result.rows[0];
    },
    async update(id, data) {
      const keys = Object.keys(data);
      const assignments = keys.map((key, index) => `${key} = $${index + 1}`);
      const result = await db.query(
        `UPDATE inventory_items SET ${assignments.join(', ')}
         WHERE id = $${keys.length + 1} RETURNING ${columns}`,
        [...keys.map((key) => data[key]), id],
      );
      return result.rows[0];
    },
    async remove(id) {
      const result = await db.query(
        'DELETE FROM inventory_items WHERE id = $1 RETURNING id', [id],
      );
      return result.rows[0];
    },
  };
}
