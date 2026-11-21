const columns = 'id, disaster_id, report_snapshot, generated_by, generated_by_name, generated_at';

function filters(query) {
  const conditions = ['TRUE'];
  const values = [];
  for (const key of ['disaster_id', 'generated_by']) {
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
        `WITH filtered AS (SELECT ${columns} FROM generated_reports WHERE ${where})
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
      const result = await db.query(`SELECT ${columns} FROM generated_reports WHERE id = $1`, [id]);
      return result.rows[0];
    },
    async create(data) {
      const result = await db.query(
        `INSERT INTO generated_reports (disaster_id, report_snapshot, generated_by, generated_by_name)
         VALUES ($1, $2, $3, $4) RETURNING ${columns}`,
        [data.disaster_id, (data.report_snapshot == null ? null : JSON.stringify(data.report_snapshot)), data.generated_by, data.generated_by_name],
      );
      return result.rows[0];
    },
  };
}
