const columns = 'id, user_id, action, entity_type, entity_id, before_data, after_data, occurred_at';

function filters(query) {
  const conditions = ['TRUE'];
  const values = [];
  for (const key of ['user_id', 'action', 'entity_type', 'entity_id']) {
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
        `WITH filtered AS (SELECT ${columns} FROM audit_logs WHERE ${where})
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
      const result = await db.query(`SELECT ${columns} FROM audit_logs WHERE id = $1`, [id]);
      return result.rows[0];
    },
    async create(data) {
      const result = await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${columns}`,
        [data.user_id, data.action, data.entity_type, data.entity_id, (data.before_data == null ? null : JSON.stringify(data.before_data)), (data.after_data == null ? null : JSON.stringify(data.after_data))],
      );
      return result.rows[0];
    },
  };
}
