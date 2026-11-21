export function createRepository(db) {
  return {
    async findByUsername(username) {
      return (await db.query('SELECT id, name, username, role, password_hash FROM users WHERE username = $1', [username])).rows[0];
    },
    async findById(id) {
      return (await db.query('SELECT id, name, username, role FROM users WHERE id = $1', [id])).rows[0];
    },
    async isRevoked(jti) {
      return (await db.query('SELECT 1 FROM auth_revoked_tokens WHERE jti = $1 AND expires_at > NOW()', [jti])).rowCount > 0;
    },
    async revoke(jti, expiresAt) {
      await db.query('INSERT INTO auth_revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING', [jti, expiresAt]);
    },
  };
}