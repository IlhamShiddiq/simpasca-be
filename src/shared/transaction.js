/**
 * Runs fn inside one database transaction (BEGIN/COMMIT, ROLLBACK on error).
 * A checked-out client (release()) is already inside its caller's transaction, as in
 * the integration tests; test doubles without connect() run fn directly.
 */
export async function withTransaction(db, fn) {
  if (typeof db.connect !== 'function' || typeof db.release === 'function') return fn(db);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
