const columns = 'id, name, username, role, created_at, updated_at';

function filters(query) {
  const conditions = ['TRUE'];
  const values = [];
  for (const key of ['username', 'role']) {
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
        `WITH filtered AS (SELECT ${columns} FROM users WHERE ${where})
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
      const result = await db.query(`SELECT ${columns} FROM users WHERE id = $1`, [id]);
      return result.rows[0];
    },
    async create(data) {
      const result = await db.query(
        `INSERT INTO users (name, username, password_hash, role)
         VALUES ($1, $2, $3, $4) RETURNING ${columns}`,
        [data.name, data.username, data.password_hash, data.role],
      );
      return result.rows[0];
    },
    async update(id, data) {
      const keys = Object.keys(data);
      const assignments = keys.map((key, index) => `${key} = $${index + 1}`);
      const result = await db.query(
        `UPDATE users SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE id = $${keys.length + 1} RETURNING ${columns}`,
        [...keys.map((key) => data[key]), id],
      );
      return result.rows[0];
    },
    async remove(id) {
      const result = await db.query(
        'DELETE FROM users WHERE id = $1 RETURNING id', [id],
      );
      return result.rows[0];
    },
  };
}
