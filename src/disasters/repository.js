const columns = 'id, disaster_type, province, regency_city, latitude::text, longitude::text, location_details, status, handling_scale, occurred_at, affected_people, affected_households, impact_notes, created_by';

function filters(query) {
  const conditions = ['TRUE'];
  const values = [];
  for (const key of ['status', 'disaster_type', 'province', 'regency_city', 'created_by']) {
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
        `WITH filtered AS (SELECT ${columns} FROM disasters WHERE ${where})
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
      const result = await db.query(`SELECT ${columns} FROM disasters WHERE id = $1`, [id]);
      return result.rows[0];
    },
    async create(data) {
      const result = await db.query(
        `INSERT INTO disasters (disaster_type, province, regency_city, latitude, longitude, location_details, status, handling_scale, occurred_at, affected_people, affected_households, impact_notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING ${columns}`,
        [data.disaster_type, data.province, data.regency_city, data.latitude ?? null, data.longitude ?? null, data.location_details ?? null, data.status, data.handling_scale, data.occurred_at, data.affected_people ?? 0, data.affected_households ?? 0, data.impact_notes ?? null, data.created_by],
      );
      return result.rows[0];
    },
    async update(id, data) {
      const keys = Object.keys(data);
      const assignments = keys.map((key, index) => `${key} = $${index + 1}`);
      const result = await db.query(
        `UPDATE disasters SET ${assignments.join(', ')}
         WHERE id = $${keys.length + 1} RETURNING ${columns}`,
        [...keys.map((key) => data[key]), id],
      );
      return result.rows[0];
    },
    async remove(id) {
      const result = await db.query(
        'DELETE FROM disasters WHERE id = $1 RETURNING id', [id],
      );
      return result.rows[0];
    },
  };
}
