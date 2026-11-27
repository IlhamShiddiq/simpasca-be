import { domainTools } from '../shared/domain.js';

const columns = 'id, type, amount::text, description, transaction_date::text, request_key, created_by, created_at, updated_at, deleted_at';

function filters(query) {
  const conditions = ['deleted_at IS NULL'];
  const values = [];
  for (const [key, column, operator] of [
    ['type', 'type', '='], ['date_from', 'transaction_date', '>='], ['date_to', 'transaction_date', '<='],
  ]) {
    if (query[key]) {
      values.push(query[key]);
      conditions.push(`${column} ${operator} $${values.length}`);
    }
  }
  return { where: conditions.join(' AND '), values };
}

export function createRepository(db) {
  return {
    ...domainTools(db, createRepository),
    async list(query) {
      const { where, values } = filters(query);
      // Count and rows share the same database snapshot, including an empty page.
      const result = await db.query(
        `WITH filtered AS (SELECT ${columns} FROM cash_transactions WHERE ${where})
         SELECT (SELECT COUNT(*)::integer FROM filtered) AS total,
           COALESCE((SELECT json_agg(page_rows) FROM (
             SELECT * FROM filtered ORDER BY transaction_date DESC, id DESC
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}
           ) page_rows), '[]'::json) AS data`,
        [...values, query.limit, (query.page - 1) * query.limit],
      );
      return result.rows[0];
    },
    async find(id) {
      const result = await db.query(`SELECT ${columns} FROM cash_transactions WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
      return result.rows[0];
    },
    async create(data) {
      const result = await db.query(
        `INSERT INTO cash_transactions (type, amount, description, transaction_date, request_key, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${columns}`,
        [data.type, data.amount, data.description ?? null, data.transaction_date, data.request_key, data.created_by],
      );
      return result.rows[0];
    },
    async update(id, data) {
      const keys = Object.keys(data);
      const assignments = keys.map((key, index) => `${key} = $${index + 1}`);
      const result = await db.query(
        `UPDATE cash_transactions SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE id = $${keys.length + 1} AND deleted_at IS NULL RETURNING ${columns}`,
        [...keys.map((key) => data[key]), id],
      );
      return result.rows[0];
    },
    async remove(id) {
      const result = await db.query(
        'UPDATE cash_transactions SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [id],
      );
      return result.rows[0];
    },
    async summary(query) {
      const { where, values } = filters(query);
      const result = await db.query(
        `SELECT COUNT(*)::integer AS total_transactions,
         COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0)::numeric(20,2)::text AS total_income,
         COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::numeric(20,2)::text AS total_expense,
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0)::numeric(20,2)::text AS balance
         FROM cash_transactions WHERE ${where}`, values,
      );
      return result.rows[0];
    },
  };
}